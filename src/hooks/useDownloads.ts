import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Config, DownloadInfo, Episode, Movie, ProgressPayload, Series } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { formatSize, formatSpeed, formatTime } from '../utils/formatters';
import { getStreamUrl } from '../utils/media';
import {
  startDownload,
  cancelDownload,
  getDownloadPath,
  checkFileExists,
  deleteLocalFile,
  syncMoviesWithDisk,
  syncEpisodesWithDisk,
  syncScannedEpisodesWithDisk,
  getEpisodeDownloadRelativePath,
} from '../services/downloads';
import { selectFolder, openFolder } from '../services/system';

function isBetterKey(candidateKey: string, currentKey: string): boolean {
  const candidateIsNumericEp = /^episode-\d+$/.test(candidateKey);
  const currentIsNumericEp = /^episode-\d+$/.test(currentKey);
  return candidateIsNumericEp && !currentIsNumericEp;
}

function sanitizeSavedItem(key: string, item: DownloadInfo): { normKey: string; cleanItem: DownloadInfo } {
  const normKey = key.startsWith('movie-') || key.startsWith('episode-') ? key : `movie-${key}`;
  const parsedKeyNum = Number(key.replace(/^[a-z]+-/, ''));
  const validKeyNum = !Number.isNaN(parsedKeyNum) && parsedKeyNum > 0 ? parsedKeyNum : undefined;
  const validMediaId =
    typeof item.mediaId === 'number' && !Number.isNaN(item.mediaId) && item.mediaId > 0
      ? item.mediaId
      : undefined;

  const cleanItem: DownloadInfo = {
    ...item,
    id: normKey,
    mediaType: item.mediaType || 'movie',
    mediaId: validMediaId || (typeof item.id === 'number' ? item.id : validKeyNum) || 0,
    status: item.status === 'downloading' ? 'paused' : item.status,
    stats: item.status === 'downloading' ? 'En pause' : item.stats,
  };

  return { normKey, cleanItem };
}

function insertDeduplicatedDownload(
  sanitized: Record<string, DownloadInfo>,
  pathToKey: Map<string, string>,
  normKey: string,
  cleanItem: DownloadInfo
): void {
  if (cleanItem.path) {
    const normPath = cleanItem.path.toLowerCase();
    const existingKey = pathToKey.get(normPath);
    if (existingKey) {
      if (isBetterKey(normKey, existingKey)) {
        delete sanitized[existingKey];
        sanitized[normKey] = cleanItem;
        pathToKey.set(normPath, normKey);
      }
      return;
    }
    pathToKey.set(normPath, normKey);
  }

  sanitized[normKey] = cleanItem;
}

function parseSavedDownloads(saved: string | null): Record<string, DownloadInfo> {
  if (!saved) return {};
  try {
    const parsed: Record<string, DownloadInfo> = JSON.parse(saved);
    const sanitized: Record<string, DownloadInfo> = {};
    const pathToKey = new Map<string, string>();

    for (const [key, item] of Object.entries(parsed)) {
      const { normKey, cleanItem } = sanitizeSavedItem(key, item);
      insertDeduplicatedDownload(sanitized, pathToKey, normKey, cleanItem);
    }
    return sanitized;
  } catch {
    // Corrupted localStorage data; fallback to empty record
    return {};
  }
}

async function resolveCancellationPath(
  id: string,
  dl: DownloadInfo | undefined,
  deleteFromDisk: boolean
): Promise<string | undefined> {
  if (dl?.status !== 'downloading') return dl?.path;
  try {
    const pathFromRust = await cancelDownload(id, deleteFromDisk);
    return pathFromRust || dl.path;
  } catch {
    return dl?.path;
  }
}

async function resolveDeletePath(
  resolvedPath: string | undefined,
  fallbackFilename?: string,
  downloadDir?: string
): Promise<string | undefined> {
  if (resolvedPath || !fallbackFilename) return resolvedPath;
  try {
    return await getDownloadPath(fallbackFilename, downloadDir || undefined);
  } catch {
    return undefined;
  }
}

async function cleanupLocalDownload(
  id: string,
  dl: DownloadInfo | undefined,
  deleteFromDisk: boolean,
  fallbackFilename?: string,
  downloadDir?: string
): Promise<void> {
  let resolvedPath = await resolveCancellationPath(id, dl, deleteFromDisk);

  if (!deleteFromDisk) return;

  resolvedPath = await resolveDeletePath(resolvedPath, fallbackFilename, downloadDir);
  if (!resolvedPath) return;

  if (dl?.status === 'downloading') {
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  try {
    await deleteLocalFile(resolvedPath);
  } catch {
    // File deletion failure ignored
  }
}

async function getValidExistingKeys(downloads: Record<string, DownloadInfo>): Promise<Set<string>> {
  const validKeys = new Set<string>();
  for (const [key, info] of Object.entries(downloads)) {
    if (info.status === 'downloading' || info.status === 'paused' || !info.path) {
      validKeys.add(key);
      continue;
    }
    try {
      const exists = await checkFileExists(info.path);
      if (exists) {
        validKeys.add(key);
      }
    } catch {
      // If check fails, retain key to prevent accidental cleanup
      validKeys.add(key);
    }
  }
  return validKeys;
}

function hasDownloadsChanged(prev: Record<string, DownloadInfo>, next: Record<string, DownloadInfo>): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return true;

  for (const key of nextKeys) {
    const p = prev[key];
    const n = next[key];
    if (
      p?.status !== n.status ||
      p?.path !== n.path ||
      p?.progress !== n.progress ||
      p?.stats !== n.stats ||
      p?.sizeStr !== n.sizeStr
    ) {
      return true;
    }
  }
  return false;
}

function mergeExistingDownloads(
  prev: Record<string, DownloadInfo>,
  validExistingKeys: Set<string>,
  pathToKey: Map<string, string>
): Record<string, DownloadInfo> {
  const next: Record<string, DownloadInfo> = {};

  for (const [key, info] of Object.entries(prev)) {
    if (info.status === 'downloading' || validExistingKeys.has(key)) {
      if (info.path) {
        const normPath = info.path.toLowerCase();
        const existingKey = pathToKey.get(normPath);
        if (existingKey) {
          if (isBetterKey(key, existingKey)) {
            delete next[existingKey];
            next[key] = info;
            pathToKey.set(normPath, key);
          }
          continue;
        }
        pathToKey.set(normPath, key);
      }
      next[key] = info;
    }
  }

  return next;
}

function mergeUpdatedItem(
  next: Record<string, DownloadInfo>,
  key: string,
  newInfo: DownloadInfo,
  pathToKey: Map<string, string>
): void {
  if (next[key]?.status === 'downloading') {
    return;
  }

  if (newInfo.path) {
    const normPath = newInfo.path.toLowerCase();
    const existingKey = pathToKey.get(normPath);
    if (existingKey) {
      if (isBetterKey(key, existingKey)) {
        delete next[existingKey];
        next[key] = {
          ...next[existingKey],
          ...newInfo,
          id: key,
        };
        pathToKey.set(normPath, key);
      } else {
        next[existingKey] = {
          ...next[existingKey],
          ...newInfo,
          id: existingKey,
        };
      }
      return;
    }
    pathToKey.set(normPath, key);
  }

  next[key] = {
    ...next[key],
    ...newInfo,
  };
}

function mergeUpdatedDownloads(
  next: Record<string, DownloadInfo>,
  updated: Record<string, DownloadInfo>,
  pathToKey: Map<string, string>
): void {
  for (const [key, newInfo] of Object.entries(updated)) {
    mergeUpdatedItem(next, key, newInfo, pathToKey);
  }
}

function computeNextSyncedDownloads(
  prev: Record<string, DownloadInfo>,
  updated: Record<string, DownloadInfo>,
  validExistingKeys: Set<string>
): Record<string, DownloadInfo> {
  const pathToKey = new Map<string, string>();
  const next = mergeExistingDownloads(prev, validExistingKeys, pathToKey);
  mergeUpdatedDownloads(next, updated, pathToKey);
  return hasDownloadsChanged(prev, next) ? next : prev;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<Record<string, DownloadInfo>>(() => {
    return parseSavedDownloads(localStorage.getItem(STORAGE_KEYS.DOWNLOADS));
  });

  const [downloadDir, setDownloadDir] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DOWNLOAD_DIR) || '';
  });

  const cancelledIdsRef = useRef<Set<string>>(new Set());
  const downloadsRef = useRef<Record<string, DownloadInfo>>(downloads);
  downloadsRef.current = downloads;

  // Save to localStorage on downloads state change
  useEffect(() => {
    downloadsRef.current = downloads;
    try {
      localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(downloads));
    } catch {
      // Ignore storage write errors (e.g. storage full)
    }
  }, [downloads]);

  // Listen to Tauri download_progress event
  useEffect(() => {
    const unlistenPromise = listen<ProgressPayload>('download_progress', event => {
      const payload = event.payload;
      if (payload.total) {
        const percent = Math.round((payload.downloaded / payload.total) * 100);
        const speedStr = payload.speed ? formatSpeed(payload.speed) : '';
        const sizeStr = `${formatSize(payload.downloaded)} / ${formatSize(payload.total)}`;

        let timeRemainingStr = '';
        if (payload.speed && payload.speed > 0) {
          const remainingSeconds = (payload.total - payload.downloaded) / payload.speed;
          timeRemainingStr = formatTime(remainingSeconds);
        }

        setDownloads(prev => {
          if (cancelledIdsRef.current.has(payload.id) || !prev[payload.id]) {
            return prev;
          }
          const current = prev[payload.id];
          const activeSpeed = speedStr || current?.speed;
          const activeTimeRemaining = timeRemainingStr || current?.timeRemaining;
          const speedAndTime = [activeSpeed, activeTimeRemaining].filter(Boolean).join('   •   ');
          const stats = speedAndTime ? `${sizeStr}   •   ${speedAndTime}` : sizeStr;

          const parsedPayloadNum = Number(payload.id.replace(/^[a-z]+-/, ''));
          const validPayloadMediaId = !Number.isNaN(parsedPayloadNum) && parsedPayloadNum > 0 ? parsedPayloadNum : undefined;
          const validCurrentMediaId = typeof current?.mediaId === 'number' && !Number.isNaN(current.mediaId) && current.mediaId > 0
            ? current.mediaId
            : undefined;

          return {
            ...prev,
            [payload.id]: {
              ...current,
              id: payload.id,
              mediaType: current?.mediaType || (payload.id.startsWith('episode-') ? 'episode' : 'movie'),
              mediaId: validCurrentMediaId || validPayloadMediaId || 0,
              title: current?.title || 'Fichier',
              subTitle: current?.subTitle,
              progress: percent,
              sizeStr,
              speed: activeSpeed,
              timeRemaining: percent >= 100 ? undefined : activeTimeRemaining,
              stats,
              status: percent >= 100 ? 'completed' : 'downloading',
            },
          };
        });
      }
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []);

  const handleDownloadComplete = (key: string, savedPath: string) => {
    if (cancelledIdsRef.current.has(key)) {
      cancelledIdsRef.current.delete(key);
      setDownloads(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setDownloads(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: 'completed',
        path: savedPath,
        progress: 100,
        speed: undefined,
      },
    }));
  };

  const handleDownloadFailure = (key: string, error: unknown) => {
    if (cancelledIdsRef.current.has(key)) {
      cancelledIdsRef.current.delete(key);
      setDownloads(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const isPaused = String(error).includes('pause');
    setDownloads(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: isPaused ? 'paused' : 'error',
        stats: isPaused ? 'En pause' : 'Erreur',
        speed: undefined,
      },
    }));
  };

  const handleDownloadMovie = async (movie: Movie, config: Config) => {
    const key = `movie-${movie.id}`;
    if (!movie.movieFile || downloadsRef.current[key]?.status === 'downloading') return;
    cancelledIdsRef.current.delete(key);

    const url = getStreamUrl(movie.movieFile.path, config);
    const ext = movie.movieFile.path.split('.').pop() || 'mkv';
    const filename = `${movie.title} (${movie.year}).${ext}`;
    const customDir = downloadDir || undefined;
    const initialPath = await getDownloadPath(filename, customDir).catch(() => '');

    setDownloads(prev => ({
      ...prev,
      [key]: {
        id: key,
        mediaType: 'movie',
        mediaId: movie.id,
        title: movie.title,
        progress: prev[key]?.progress || 0,
        stats: 'Démarrage...',
        status: 'downloading',
        speed: undefined,
        path: initialPath || prev[key]?.path,
      },
    }));

    try {
      const savedPath = await startDownload(url, filename, key, customDir);
      handleDownloadComplete(key, savedPath);
    } catch (e) {
      handleDownloadFailure(key, e);
    }
  };

  const handleDownloadEpisode = async (series: Series, episode: Episode, config: Config) => {
    const key = `episode-${episode.id}`;
    if (!episode.episodeFile || downloadsRef.current[key]?.status === 'downloading') return;
    cancelledIdsRef.current.delete(key);

    const url = getStreamUrl(episode.episodeFile.path, config);
    const relPath = getEpisodeDownloadRelativePath(series, episode);
    const sStr = String(episode.seasonNumber).padStart(2, '0');
    const eStr = String(episode.episodeNumber).padStart(2, '0');
    const titlePart = episode.title ? ` • ${episode.title}` : '';
    const subTitle = `S${sStr}E${eStr}${titlePart}`;
    const customDir = downloadDir || undefined;
    const initialPath = await getDownloadPath(relPath, customDir).catch(() => '');

    setDownloads(prev => ({
      ...prev,
      [key]: {
        id: key,
        mediaType: 'episode',
        mediaId: episode.id,
        seriesId: series.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: series.title,
        subTitle,
        progress: prev[key]?.progress || 0,
        stats: 'Démarrage...',
        status: 'downloading',
        speed: undefined,
        path: initialPath || prev[key]?.path,
      },
    }));

    try {
      const savedPath = await startDownload(url, relPath, key, customDir);
      handleDownloadComplete(key, savedPath);
    } catch (e) {
      handleDownloadFailure(key, e);
    }
  };

  const handleCancelDownload = async (id: string) => {
    try {
      await cancelDownload(id, false);
      setDownloads(prev => {
        if (!prev[id]) return prev;
        return {
          ...prev,
          [id]: {
            ...prev[id],
            status: 'paused',
            speed: undefined,
          },
        };
      });
    } catch {
      // Cancellation error ignored
    }
  };

  const handleDeleteDownload = async (
    id: string,
    deleteFromDisk: boolean = true,
    fallbackFilename?: string
  ) => {
    cancelledIdsRef.current.add(id);
    const dl = downloadsRef.current[id];
    await cleanupLocalDownload(id, dl, deleteFromDisk, fallbackFilename, downloadDir);

    setDownloads(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await selectFolder();
      if (selected) {
        setDownloadDir(selected);
        localStorage.setItem(STORAGE_KEYS.DOWNLOAD_DIR, selected);
      }
    } catch {
      // Selection dialog cancelled; ignore
    }
  };

  const handleOpenFolder = async (defaultDir?: string) => {
    try {
      const path = downloadDir || defaultDir || '';
      if (path) {
        await openFolder(path);
      }
    } catch {
      // Folder open failed; ignore
    }
  };

  const handleResetFolder = (defaultDir: string) => {
    if (defaultDir) {
      setDownloadDir(defaultDir);
      localStorage.removeItem(STORAGE_KEYS.DOWNLOAD_DIR);
    }
  };

  const syncWithDisk = useCallback(async (
    moviesList: Movie[],
    seriesList: { series: Series; episodes: Episode[] }[],
    targetDir: string,
    allSeries: Series[] = []
  ) => {
    if (!targetDir) return;
    const movieUpdates = moviesList.length ? await syncMoviesWithDisk(moviesList, targetDir) : {};
    let episodeUpdates: Record<string, DownloadInfo> = {};

    // 1. Scan the disk directly to discover all downloaded episodes (handles launch when episodesCache is empty)
    if (targetDir) {
      const scannedDisk = await syncScannedEpisodesWithDisk(allSeries, targetDir, downloadsRef.current);
      episodeUpdates = { ...episodeUpdates, ...scannedDisk };
    }

    // 2. Overlay with exact Sonarr episode metadata if available
    for (const item of seriesList) {
      if (item.episodes.length) {
        const epDisk = await syncEpisodesWithDisk(item.episodes, item.series, targetDir);
        episodeUpdates = { ...episodeUpdates, ...epDisk };
      }
    }

    const updated = { ...movieUpdates, ...episodeUpdates };
    const validExistingKeys = await getValidExistingKeys(downloadsRef.current);

    setDownloads(prev => computeNextSyncedDownloads(prev, updated, validExistingKeys));
  }, []);

  const activeCount = useMemo(() => {
    return Object.values(downloads).filter(d => d.status === 'downloading').length;
  }, [downloads]);

  return {
    downloads,
    downloadDir,
    activeCount,
    handleDownload: handleDownloadMovie,
    handleDownloadMovie,
    handleDownloadEpisode,
    handleCancelDownload,
    handleDeleteDownload,
    handleSelectFolder,
    handleOpenFolder,
    handleResetFolder,
    syncWithDisk,
  };
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Config, DownloadInfo, Movie, ProgressPayload } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { formatSize, formatSpeed, formatTime } from '../utils/formatters';
import { getStreamUrl } from '../utils/media';
import {
  startDownload,
  cancelDownload,
  deleteLocalFile,
  syncMoviesWithDisk,
} from '../services/downloads';
import { selectFolder, openFolder } from '../services/system';

export function useDownloads() {
  const [downloads, setDownloads] = useState<Record<number, DownloadInfo>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOWNLOADS);
      if (saved) {
        const parsed: Record<number, DownloadInfo> = JSON.parse(saved);
        const sanitized: Record<number, DownloadInfo> = {};
        for (const [key, item] of Object.entries(parsed)) {
          sanitized[Number(key)] = {
            ...item,
            status: item.status === 'downloading' ? 'paused' : item.status,
            stats: item.status === 'downloading' ? 'En pause' : item.stats,
          };
        }
        return sanitized;
      }
    } catch (_e) {
      // ignore
    }
    return {};
  });

  const [downloadDir, setDownloadDir] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DOWNLOAD_DIR) || '';
  });

  // Save to localStorage on downloads state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(downloads));
    } catch (_e) {
      // ignore
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
          const current = prev[payload.id];
          const activeSpeed = speedStr || current?.speed;
          const speedAndTime = [activeSpeed, timeRemainingStr].filter(Boolean).join('   •   ');
          const stats = speedAndTime ? `${sizeStr}   •   ${speedAndTime}` : sizeStr;

          return {
            ...prev,
            [payload.id]: {
              ...current,
              id: payload.id,
              progress: percent,
              sizeStr,
              speed: activeSpeed,
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

  const handleDownload = async (movie: Movie, config: Config) => {
    if (!movie.movieFile || downloads[movie.id]?.status === 'downloading') return;

    const url = getStreamUrl(movie.movieFile.path, config);
    const ext = movie.movieFile.path.split('.').pop() || 'mkv';
    const filename = `${movie.title} (${movie.year}).${ext}`;

    setDownloads(prev => ({
      ...prev,
      [movie.id]: {
        id: movie.id,
        title: movie.title,
        progress: prev[movie.id]?.progress || 0,
        stats: 'Démarrage...',
        status: 'downloading',
        speed: undefined,
      },
    }));

    try {
      const customDir = downloadDir ? downloadDir : undefined;
      const savedPath = await startDownload(url, filename, movie.id, customDir);
      setDownloads(prev => ({
        ...prev,
        [movie.id]: {
          ...prev[movie.id],
          status: 'completed',
          path: savedPath,
          progress: 100,
          speed: undefined,
        },
      }));
    } catch (e: any) {
      const isPaused = e.toString().includes('pause');
      setDownloads(prev => ({
        ...prev,
        [movie.id]: {
          ...prev[movie.id],
          status: isPaused ? 'paused' : 'error',
          stats: isPaused ? 'En pause' : 'Erreur',
          speed: undefined,
        },
      }));
    }
  };

  const handleCancelDownload = async (id: number) => {
    try {
      await cancelDownload(id);
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
    } catch (_e) {
      // ignore
    }
  };

  const handleDeleteDownload = async (id: number, deleteFromDisk: boolean = false) => {
    const dl = downloads[id];
    if (dl?.status === 'downloading') {
      await handleCancelDownload(id);
    }
    if (deleteFromDisk && dl?.path) {
      try {
        await deleteLocalFile(dl.path);
      } catch (_e) {
        // ignore
      }
    }
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
    } catch (_e) {
      // ignore
    }
  };

  const handleOpenFolder = async (defaultDir?: string) => {
    try {
      const path = downloadDir || defaultDir || '';
      if (path) {
        await openFolder(path);
      }
    } catch (_e) {
      // ignore
    }
  };

  const handleResetFolder = (defaultDir: string) => {
    if (defaultDir) {
      setDownloadDir(defaultDir);
      localStorage.removeItem(STORAGE_KEYS.DOWNLOAD_DIR);
    }
  };

  const syncWithDisk = useCallback(async (moviesList: Movie[], targetDir: string) => {
    if (!moviesList.length || !targetDir) return;
    const updated = await syncMoviesWithDisk(moviesList, targetDir);

    setDownloads(prev => {
      const next: Record<number, DownloadInfo> = {};

      // 1. Keep any currently downloading items
      for (const [idStr, info] of Object.entries(prev)) {
        const id = Number(idStr);
        if (info.status === 'downloading') {
          next[id] = info;
        }
      }

      // 2. Add all items found in targetDir
      for (const [idStr, newInfo] of Object.entries(updated)) {
        const id = Number(idStr);
        if (next[id]?.status === 'downloading') {
          continue;
        }
        next[id] = newInfo;
      }

      // 3. Fast equality check to avoid redundant re-renders
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        const id = Number(key);
        const p = prev[id];
        const n = next[id];
        if (
          !p ||
          p.status !== n.status ||
          p.path !== n.path ||
          p.progress !== n.progress ||
          p.stats !== n.stats ||
          p.sizeStr !== n.sizeStr
        ) {
          return next;
        }
      }

      return prev;
    });
  }, []);

  const activeCount = useMemo(() => {
    return Object.values(downloads).filter(d => d.status === 'downloading').length;
  }, [downloads]);

  return {
    downloads,
    downloadDir,
    activeCount,
    handleDownload,
    handleCancelDownload,
    handleDeleteDownload,
    handleSelectFolder,
    handleOpenFolder,
    handleResetFolder,
    syncWithDisk,
  };
}

import { invoke } from '@tauri-apps/api/core';
import { DownloadInfo, Episode, Movie, Series } from '../types';
import { formatSize } from '../utils/formatters';

const YEAR_END_REGEX = /\((\d{4})\)$/;

function cleanSeriesFolder(name: string): string {
  const trimmed = name.trim();
  const match = YEAR_END_REGEX.exec(trimmed);
  if (match) {
    return trimmed.slice(0, match.index).trim();
  }
  return trimmed;
}

function computeSyncStatus(sizeOnDisk: number, expectedSize: number) {
  const isComplete = expectedSize > 0 ? sizeOnDisk >= expectedSize * 0.99 : true;
  const progress = expectedSize > 0 ? Math.min(100, Math.round((sizeOnDisk / expectedSize) * 100)) : 100;
  const stats = isComplete
    ? formatSize(sizeOnDisk)
    : `${formatSize(sizeOnDisk)} / ${formatSize(expectedSize || sizeOnDisk)}`;
  return {
    isComplete,
    progress: isComplete ? 100 : progress,
    stats,
    status: isComplete ? ('completed' as const) : ('paused' as const),
  };
}

export function getEpisodeDownloadRelativePath(
  series: { title: string; year: number },
  episode: { seasonNumber: number; episodeNumber: number; title?: string; episodeFile?: { path: string } }
): string {
  const ext = episode.episodeFile?.path.split('.').pop() || 'mkv';
  const sStr = String(episode.seasonNumber).padStart(2, '0');
  const eStr = String(episode.episodeNumber).padStart(2, '0');
  const epTitleClean = (episode.title || '').replace(/[/\\:]/g, ' -').trim();
  const epTitleSuffix = epTitleClean ? ` - ${epTitleClean}` : '';
  const safeFilename = `${series.title} - S${sStr}E${eStr}${epTitleSuffix}.${ext}`;
  const seriesFolder = `${series.title} (${series.year})`.replace(/[/\\:]/g, ' -').trim();
  const seasonFolder = `Season ${sStr}`;
  return `${seriesFolder}/${seasonFolder}/${safeFilename}`;
}

export async function startDownload(
  url: string,
  filename: string,
  id: string,
  customDir?: string
): Promise<string> {
  return invoke<string>('download_video', {
    url,
    filename,
    id,
    customDir: customDir || undefined,
  });
}

export async function getDownloadPath(
  filename: string,
  customDir?: string
): Promise<string> {
  return invoke<string>('get_download_path', {
    filename,
    customDir: customDir || undefined,
  });
}

export async function cancelDownload(id: string, deleteFile: boolean = false): Promise<string | null> {
  return invoke<string | null>('cancel_download', { id, deleteFile });
}

export async function checkFileExists(path: string): Promise<boolean> {
  return invoke<boolean>('check_file_exists', { path });
}

export async function getFileSize(path: string): Promise<number | null> {
  return invoke<number | null>('get_file_size', { path });
}

export async function deleteLocalFile(path: string): Promise<void> {
  await invoke('delete_file', { path });
}

export async function syncMoviesWithDisk(
  moviesList: Movie[],
  targetDir: string
): Promise<Record<string, DownloadInfo>> {
  if (!moviesList.length || !targetDir) return {};

  const updated: Record<string, DownloadInfo> = {};
  for (const movie of moviesList) {
    if (!movie.movieFile) continue;
    const ext = movie.movieFile.path.split('.').pop() || 'mkv';
    const filename = `${movie.title} (${movie.year}).${ext}`;
    const safeFilename = filename.replace(/\//g, '_').replace(/\\/g, '_');
    const separator = targetDir.endsWith('/') || targetDir.endsWith('\\') ? '' : '/';
    const filePath = `${targetDir}${separator}${safeFilename}`;

    try {
      const exists = await checkFileExists(filePath);
      if (exists) {
        const sizeOnDisk = await getFileSize(filePath);
        const expectedSize = movie.movieFile.size;

        if (sizeOnDisk !== null && sizeOnDisk > 0) {
          const sync = computeSyncStatus(sizeOnDisk, expectedSize);
          const key = `movie-${movie.id}`;

          updated[key] = {
            id: key,
            mediaType: 'movie',
            mediaId: movie.id,
            title: movie.title,
            progress: sync.progress,
            stats: sync.stats,
            status: sync.status,
            path: filePath,
          };
        }
      }
    } catch {
      // File might be temporarily locked or inaccessible; skip quietly
    }
  }

  return updated;
}

async function checkEpisodeOnDisk(
  episode: Episode,
  series: Series,
  targetDir: string,
  separator: string
): Promise<DownloadInfo | null> {
  if (!episode.hasFile || !episode.episodeFile) return null;
  const relPath = getEpisodeDownloadRelativePath(series, episode);
  const filePath = `${targetDir}${separator}${relPath}`;

  try {
    const exists = await checkFileExists(filePath);
    if (exists) {
      const sizeOnDisk = await getFileSize(filePath);
      const expectedSize = episode.episodeFile.size;

      if (sizeOnDisk !== null && sizeOnDisk > 0) {
        const sync = computeSyncStatus(sizeOnDisk, expectedSize);
        const sStr = String(episode.seasonNumber).padStart(2, '0');
        const eStr = String(episode.episodeNumber).padStart(2, '0');
        const key = `episode-${episode.id}`;
        const titleSuffix = episode.title ? ` • ${episode.title}` : '';

        return {
          id: key,
          mediaType: 'episode',
          mediaId: episode.id,
          seriesId: series.id,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: series.title,
          subTitle: `S${sStr}E${eStr}${titleSuffix}`,
          progress: sync.progress,
          stats: sync.stats,
          status: sync.status,
          path: filePath,
        };
      }
    }
  } catch {
    // Episode file might be unavailable on disk; ignore and continue scan
  }
  return null;
}

export async function syncEpisodesWithDisk(
  episodes: Episode[],
  series: Series,
  targetDir: string
): Promise<Record<string, DownloadInfo>> {
  if (!episodes.length || !series || !targetDir) return {};

  const updated: Record<string, DownloadInfo> = {};
  const separator = targetDir.endsWith('/') || targetDir.endsWith('\\') ? '' : '/';

  for (const episode of episodes) {
    const info = await checkEpisodeOnDisk(episode, series, targetDir, separator);
    if (info) {
      updated[info.id] = info;
    }
  }

  return updated;
}

export interface ScannedLocalEpisode {
  series_folder: string;
  season_number: number;
  episode_number: number;
  title: string | null;
  file_path: string;
  file_size: number;
}

export async function scanLocalEpisodes(dir: string): Promise<ScannedLocalEpisode[]> {
  return invoke<ScannedLocalEpisode[]>('scan_local_episodes', { dir });
}

export async function syncScannedEpisodesWithDisk(
  allSeries: Series[],
  targetDir: string,
  existingDownloads: Record<string, DownloadInfo> = {}
): Promise<Record<string, DownloadInfo>> {
  if (!targetDir) return {};
  try {
    const scanned = await scanLocalEpisodes(targetDir);
    const updated: Record<string, DownloadInfo> = {};

    for (const ep of scanned) {
      const cleanFolder = cleanSeriesFolder(ep.series_folder).toLowerCase();
      const matchedSeries = allSeries.find(s => {
        const sTitleClean = s.title.trim().toLowerCase();
        return sTitleClean === cleanFolder || s.title.toLowerCase() === ep.series_folder.toLowerCase();
      });

      const sStr = String(ep.season_number).padStart(2, '0');
      const eStr = String(ep.episode_number).padStart(2, '0');
      const seriesTitle = matchedSeries?.title || cleanSeriesFolder(ep.series_folder);
      const seriesId = matchedSeries?.id;

      // Look for an existing download item that represents this exact file
      const existingByPath = Object.values(existingDownloads).find(
        d => d.path?.toLowerCase() === ep.file_path.toLowerCase()
      );
      const existingByEp = existingByPath || Object.values(existingDownloads).find(
        d => d.mediaType === 'episode' &&
             ((seriesId && d.seriesId === seriesId) || d.title.trim().toLowerCase() === seriesTitle.trim().toLowerCase()) &&
             (d.seasonNumber ?? 0) === ep.season_number &&
             (d.episodeNumber ?? 0) === ep.episode_number
      );

      const key = existingByEp?.id || (seriesId
        ? `episode-${seriesId}-s${ep.season_number}e${ep.episode_number}`
        : `episode-${ep.series_folder}-s${ep.season_number}e${ep.episode_number}`);

      const titlePart = ep.title ? ` • ${ep.title}` : '';
      const subTitle = `S${sStr}E${eStr}${titlePart}`;

      updated[key] = {
        id: key,
        mediaType: 'episode',
        mediaId: existingByEp?.mediaId || 0,
        seriesId: seriesId || existingByEp?.seriesId,
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
        title: seriesTitle,
        subTitle,
        progress: 100,
        stats: formatSize(ep.file_size),
        status: 'completed',
        path: ep.file_path,
      };
    }

    return updated;
  } catch {
    // Directory might not exist or scanning failed; return empty record
    return {};
  }
}

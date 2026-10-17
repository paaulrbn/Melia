import { invoke } from '@tauri-apps/api/core';
import { DownloadInfo, Episode, Movie, Series } from '../types';
import { formatSize } from '../utils/formatters';
import { invokeSynced } from './runtime';

const YEAR_END_REGEX = /\((\d{4})\)$/;

function cleanSeriesFolder(name: string): string {
  const trimmed = name.trim();
  const match = YEAR_END_REGEX.exec(trimmed);
  if (match) {
    return trimmed.slice(0, match.index).trim();
  }
  return trimmed;
}

export function computeSyncStatus(sizeOnDisk: number, expectedSize: number) {
  const isComplete = expectedSize > 0 ? sizeOnDisk >= expectedSize : true;
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

/** A title is one path component: separators would create sub-folders on disk. */
function withoutPathSeparators(title: string): string {
  return title.replace(/[/\\]/g, '_');
}

export function getMovieDownloadFilename(movie: { title: string; year: number; movieFile?: { path: string } }): string {
  const ext = movie.movieFile?.path.split('.').pop() || 'mkv';
  return `${withoutPathSeparators(movie.title)} (${movie.year}).${ext}`;
}

export function getEpisodeDownloadRelativePath(
  series: { title: string; year: number },
  episode: { seasonNumber: number; episodeNumber: number; title?: string; episodeFile?: { path: string } }
): string {
  const ext = episode.episodeFile?.path.split('.').pop() || 'mkv';
  const sStr = String(episode.seasonNumber).padStart(2, '0');
  const eStr = String(episode.episodeNumber).padStart(2, '0');
  // Separators become " -" (as before) so existing series folders keep matching
  const seriesTitle = series.title.replace(/[/\\]/g, ' -');
  const epTitleClean = (episode.title || '').replace(/[/\\:]/g, ' -').trim();
  const epTitleSuffix = epTitleClean ? ` - ${epTitleClean}` : '';
  const safeFilename = `${seriesTitle} - S${sStr}E${eStr}${epTitleSuffix}.${ext}`;
  const seriesFolder = `${seriesTitle} (${series.year})`.replace(/:/g, ' -').trim();
  const seasonFolder = `Season ${sStr}`;
  return `${seriesFolder}/${seasonFolder}/${safeFilename}`;
}

/** Error codes sent by the Rust downloader (`DownloadError.code`). */
export type DownloadErrorCode =
  | 'ALREADY_RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'CONNECTION_LOST'
  | 'FAILED';

export class DownloadError extends Error {
  readonly code: DownloadErrorCode;

  constructor(code: DownloadErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const DOWNLOAD_ERROR_CODES: readonly string[] = ['ALREADY_RUNNING', 'PAUSED', 'CANCELLED', 'CONNECTION_LOST', 'FAILED'];

function toDownloadError(raw: unknown): DownloadError {
  if (raw && typeof raw === 'object' && 'code' in raw && 'message' in raw) {
    const { code, message } = raw as { code: unknown; message: unknown };
    if (typeof code === 'string' && DOWNLOAD_ERROR_CODES.includes(code)) {
      return new DownloadError(code as DownloadErrorCode, String(message));
    }
  }
  return new DownloadError('FAILED', typeof raw === 'string' ? raw : (raw as Error)?.message || 'Erreur inconnue');
}

export async function startDownload(
  url: string,
  filename: string,
  id: string
): Promise<string> {
  try {
    return await invokeSynced<string>('download_video', { url, filename, id });
  } catch (e: unknown) {
    throw toDownloadError(e);
  }
}

/** Full path of a download inside the configured folder. Names are sanitized by Rust (single source of truth). */
export async function getDownloadPath(filename: string): Promise<string> {
  return invokeSynced<string>('get_download_path', { filename });
}

export async function cancelDownload(id: string, deleteFile: boolean = false): Promise<string | null> {
  return invoke<string | null>('cancel_download', { id, deleteFile });
}

export async function checkFileExists(path: string): Promise<boolean> {
  return invokeSynced<boolean>('check_file_exists', { path });
}

export async function getFileSize(path: string): Promise<number | null> {
  return invokeSynced<number | null>('get_file_size', { path });
}

export async function deleteLocalFile(path: string): Promise<void> {
  await invokeSynced('delete_file', { path });
}

interface DownloadFileStat {
  path: string;
  size: number | null;
}

/** Resolves and stats many download names in a single IPC call. Rust sanitizes the names. */
async function statDownloads(filenames: string[]): Promise<DownloadFileStat[]> {
  if (filenames.length === 0) return [];
  return invokeSynced<DownloadFileStat[]>('stat_downloads', { filenames });
}

export async function syncMoviesWithDisk(
  moviesList: Movie[],
  targetDir: string
): Promise<Record<string, DownloadInfo>> {
  const movies = moviesList.filter(movie => movie.movieFile);
  if (!movies.length || !targetDir) return {};

  let stats: DownloadFileStat[];
  try {
    stats = await statDownloads(movies.map(movie => getMovieDownloadFilename(movie)));
  } catch {
    // Disk temporarily inaccessible; keep the current state
    return {};
  }

  const updated: Record<string, DownloadInfo> = {};
  movies.forEach((movie, index) => {
    const { path, size } = stats[index];
    if (!size || !movie.movieFile) return;

    const sync = computeSyncStatus(size, movie.movieFile.size);
    const key = `movie-${movie.id}`;
    updated[key] = {
      id: key,
      mediaType: 'movie',
      mediaId: movie.id,
      title: movie.title,
      progress: sync.progress,
      stats: sync.stats,
      status: sync.status,
      path,
    };
  });
  return updated;
}

export async function syncEpisodesWithDisk(
  episodes: Episode[],
  series: Series,
  targetDir: string
): Promise<Record<string, DownloadInfo>> {
  const withFiles = episodes.filter(episode => episode.hasFile && episode.episodeFile);
  if (!withFiles.length || !series || !targetDir) return {};

  let stats: DownloadFileStat[];
  try {
    stats = await statDownloads(withFiles.map(episode => getEpisodeDownloadRelativePath(series, episode)));
  } catch {
    // Episode files unavailable on disk; keep the current state
    return {};
  }

  const updated: Record<string, DownloadInfo> = {};
  withFiles.forEach((episode, index) => {
    const { path, size } = stats[index];
    if (!size || !episode.episodeFile) return;

    const sync = computeSyncStatus(size, episode.episodeFile.size);
    const sStr = String(episode.seasonNumber).padStart(2, '0');
    const eStr = String(episode.episodeNumber).padStart(2, '0');
    const key = `episode-${episode.id}`;
    const titleSuffix = episode.title ? ` • ${episode.title}` : '';
    updated[key] = {
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
      path,
    };
  });
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

/** Scans the configured download folder (the folder itself is held by Rust). */
export async function scanLocalEpisodes(): Promise<ScannedLocalEpisode[]> {
  return invokeSynced<ScannedLocalEpisode[]>('scan_local_episodes');
}

export async function syncScannedEpisodesWithDisk(
  allSeries: Series[],
  targetDir: string,
  existingDownloads: Record<string, DownloadInfo> = {}
): Promise<Record<string, DownloadInfo>> {
  if (!targetDir) return {};
  try {
    const scanned = await scanLocalEpisodes();
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

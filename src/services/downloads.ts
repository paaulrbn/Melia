import { invoke } from '@tauri-apps/api/core';
import { DownloadInfo, Movie } from '../types';
import { formatSize } from '../utils/formatters';

export async function startDownload(
  url: string,
  filename: string,
  id: number,
  customDir?: string
): Promise<string> {
  return invoke<string>('download_video', {
    url,
    filename,
    id,
    customDir: customDir || undefined,
  });
}

export async function cancelDownload(id: number): Promise<void> {
  await invoke('cancel_download', { id });
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
): Promise<Record<number, DownloadInfo>> {
  if (!moviesList.length || !targetDir) return {};

  const updated: Record<number, DownloadInfo> = {};
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
          const isComplete = expectedSize > 0 ? sizeOnDisk >= expectedSize * 0.99 : true;
          const progress = expectedSize > 0 ? Math.min(100, Math.round((sizeOnDisk / expectedSize) * 100)) : 100;
          const stats = `${formatSize(sizeOnDisk)} / ${formatSize(expectedSize || sizeOnDisk)}`;

          updated[movie.id] = {
            id: movie.id,
            title: movie.title,
            progress: isComplete ? 100 : progress,
            stats: isComplete ? formatSize(sizeOnDisk) : stats,
            status: isComplete ? 'completed' : 'paused',
            path: filePath,
          };
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  return updated;
}

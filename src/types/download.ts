export type DownloadStatus = 'downloading' | 'completed' | 'error' | 'paused';

export interface DownloadInfo {
  id: number;
  title: string;
  progress: number;
  sizeStr?: string;
  speed?: string;
  stats: string;
  status: DownloadStatus;
  path?: string;
}

export interface ProgressPayload {
  id: number;
  downloaded: number;
  total: number;
  speed?: number;
}

export type DownloadStatus = 'downloading' | 'completed' | 'error' | 'paused';
export type MediaType = 'movie' | 'episode';

export interface DownloadInfo {
  id: string; // "movie-123" or "episode-456"
  mediaType: MediaType;
  mediaId: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  subTitle?: string;
  progress: number;
  sizeStr?: string;
  speed?: string;
  timeRemaining?: string;
  stats: string;
  status: DownloadStatus;
  path?: string;
}

export interface ProgressPayload {
  id: string;
  downloaded: number;
  total: number;
  speed?: number;
}

export interface UnifiedQueueItem {
  id: string; // "radarr-123" or "sonarr-456"
  mediaType: MediaType;
  mediaId: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  title: string; // "Inception (2010)" or "Breaking Bad"
  subTitle?: string; // "S01E01 - Chute libre"
  size: number;
  sizeleft: number;
  timeleft?: string;
  status?: string;
  trackedDownloadStatus?: string;
  queueId?: number;
}

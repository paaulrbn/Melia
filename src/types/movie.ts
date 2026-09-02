export interface MovieImage {
  coverType: string;
  remoteUrl: string;
}

export interface MovieFile {
  path: string;
  size: number;
}

export interface Movie {
  id: number;
  tmdbId?: number;
  title: string;
  year: number;
  overview: string;
  runtime?: number;
  images: MovieImage[];
  hasFile: boolean;
  movieFile?: MovieFile;
  qualityProfileId?: number;
  rootFolderPath?: string;
  monitored?: boolean;
}

export interface LookupMovie {
  tmdbId: number;
  title: string;
  year: number;
  overview: string;
  runtime?: number;
  images: MovieImage[];
  ratings?: { imdb?: { value: number } };
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface QueueRecord {
  id?: number;
  movieId: number;
  title?: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  status?: string;
  trackedDownloadStatus?: string;
  movie?: {
    title: string;
    year: number;
  };
}

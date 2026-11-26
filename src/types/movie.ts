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
  /** Radarr release status: only `released` means a file can exist */
  status?: 'tba' | 'announced' | 'inCinemas' | 'released' | 'deleted';
  inCinemas?: string;
  digitalRelease?: string;
  physicalRelease?: string;
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

/** Radarr credit (`GET /api/v3/credit?movieId=`), only the fields we read. */
export interface MovieCredit {
  personName?: string;
  /** `cast` or `crew` */
  type?: string;
  /** Crew job, for example `Director` */
  job?: string;
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

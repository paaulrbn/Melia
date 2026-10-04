import { MovieImage } from './movie';

export interface SeasonInfo {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
  };
}

export interface SeriesStatistics {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
}

export interface Series {
  id: number;
  tvdbId: number;
  title: string;
  year: number;
  overview: string;
  status: string; // "continuing", "ended", "upcoming"
  network?: string;
  runtime?: number;
  images: MovieImage[];
  seasons: SeasonInfo[];
  statistics?: SeriesStatistics;
  qualityProfileId?: number;
  rootFolderPath?: string;
  monitored?: boolean;
}

export interface LookupSeries {
  tvdbId: number;
  title: string;
  year: number;
  overview: string;
  status?: string;
  network?: string;
  images: MovieImage[];
  seasons?: SeasonInfo[];
  ratings?: { value: number };
}

export interface EpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  path: string;
  size: number;
  quality?: {
    quality?: {
      name?: string;
    };
  };
}

export interface Episode {
  id: number;
  seriesId: number;
  tvdbId?: number;
  episodeFileId?: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDateUtc?: string;
  hasFile: boolean;
  monitored: boolean;
  runtime?: number;
  episodeFile?: EpisodeFile;
}

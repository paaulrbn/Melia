import { invoke } from '@tauri-apps/api/core';
import { LookupMovie, Movie, QualityProfile, QueueRecord } from '../types';

export async function fetchRadarrMovies(baseUrl: string, apiKey: string): Promise<Movie[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/movie?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('fetch_radarr_movies', { url });
  const data: Movie[] = JSON.parse(jsonStr);
  return data.reverse();
}

export async function fetchRadarrMovie(baseUrl: string, apiKey: string, movieId: number): Promise<Movie> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/movie/${movieId}?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('search_radarr_movies', { url });
  return JSON.parse(jsonStr);
}

export async function searchRadarrMovies(baseUrl: string, apiKey: string, term: string): Promise<LookupMovie[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/movie/lookup?term=${encodeURIComponent(term)}&apiKey=${apiKey}`;
  const jsonStr: string = await invoke('search_radarr_movies', { url });
  return JSON.parse(jsonStr);
}

export async function fetchQualityProfiles(baseUrl: string, apiKey: string): Promise<QualityProfile[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/qualityprofile?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('get_radarr_quality_profiles', { url });
  return JSON.parse(jsonStr);
}

export interface AddMovieParams {
  baseUrl: string;
  apiKey: string;
  rootFolder: string;
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
}

export async function addRadarrMovie(params: AddMovieParams): Promise<Movie> {
  const { baseUrl, apiKey, rootFolder, tmdbId, title, year, qualityProfileId } = params;
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/movie?apiKey=${apiKey}`;
  const body = JSON.stringify({
    tmdbId,
    title,
    year,
    qualityProfileId,
    rootFolderPath: rootFolder || '/movies',
    monitored: true,
    addOptions: {
      searchForMovie: true,
    },
  });

  const jsonStr: string = await invoke('add_radarr_movie', { url, body });
  return JSON.parse(jsonStr);
}

export async function deleteRadarrMovie(baseUrl: string, apiKey: string, movieId: number): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/movie/${movieId}?deleteFiles=true&apiKey=${apiKey}`;
  await invoke('delete_radarr_movie', { url });
}

export async function fetchRadarrQueue(baseUrl: string, apiKey: string): Promise<Record<number, QueueRecord>> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/queue?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('search_radarr_movies', { url });
  const data = JSON.parse(jsonStr);

  const queueMap: Record<number, QueueRecord> = {};
  if (data && Array.isArray(data.records)) {
    data.records.forEach((record: any) => {
      if (record.movieId) {
        queueMap[record.movieId] = {
          id: record.id,
          movieId: record.movieId,
          title: record.title || record.movie?.title,
          size: record.size || 0,
          sizeleft: record.sizeleft || 0,
          timeleft: record.timeleft,
          status: record.status,
          trackedDownloadStatus: record.trackedDownloadStatus,
          movie: record.movie ? {
            title: record.movie.title,
            year: record.movie.year,
          } : undefined,
        };
      }
    });
  }
  return queueMap;
}

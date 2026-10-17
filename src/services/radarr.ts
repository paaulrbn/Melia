import { LookupMovie, Movie, QualityProfile, QueueRecord } from '../types';
import { normalizeRootFolder } from '../utils/formatters';
import { invokeSynced } from './runtime';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Radarr base URL and API key live on the Rust side: only a relative `/api/v3/...` path is sent. */
function radarrRequest(method: HttpMethod, path: string, body?: unknown): Promise<string> {
  return invokeSynced<string>('radarr_request', {
    method,
    path,
    body: body === undefined ? null : JSON.stringify(body),
  });
}

export async function fetchRadarrMovies(): Promise<Movie[]> {
  const data: Movie[] = JSON.parse(await radarrRequest('GET', '/api/v3/movie'));
  return data.reverse();
}

export async function fetchRadarrMovie(movieId: number): Promise<Movie> {
  return JSON.parse(await radarrRequest('GET', `/api/v3/movie/${movieId}`));
}

export async function searchRadarrMovies(term: string): Promise<LookupMovie[]> {
  return JSON.parse(await radarrRequest('GET', `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`));
}

export async function fetchQualityProfiles(): Promise<QualityProfile[]> {
  return JSON.parse(await radarrRequest('GET', '/api/v3/qualityprofile'));
}

export interface AddMovieParams {
  rootFolder: string;
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
}

export async function addRadarrMovie(params: AddMovieParams): Promise<Movie> {
  const { rootFolder, tmdbId, title, year, qualityProfileId } = params;
  const cleanRoot = normalizeRootFolder(rootFolder, '/movies');

  const created = await radarrRequest('POST', '/api/v3/movie', {
    tmdbId,
    title,
    year,
    qualityProfileId,
    rootFolderPath: cleanRoot,
    monitored: true,
    minimumAvailability: 'announced',
    addOptions: {
      searchForMovie: true,
      monitor: 'movieOnly',
    },
  });
  return JSON.parse(created);
}

export async function updateRadarrMovieQuality(movieId: number, qualityProfileId: number): Promise<Movie> {
  // Radarr PUT expects the full movie object: fetch it, change the profile, send it back
  const current = JSON.parse(await radarrRequest('GET', `/api/v3/movie/${movieId}`));
  const updated = await radarrRequest('PUT', `/api/v3/movie/${movieId}`, { ...current, qualityProfileId });
  return JSON.parse(updated);
}

export async function triggerRadarrMovieSearch(movieId: number): Promise<void> {
  await radarrRequest('POST', '/api/v3/command', {
    name: 'MoviesSearch',
    movieIds: [movieId],
  });
}

export async function deleteRadarrMovie(movieId: number): Promise<void> {
  await radarrRequest('DELETE', `/api/v3/movie/${movieId}?deleteFiles=true`);
}

export async function deleteRadarrQueueItem(queueId: number): Promise<void> {
  await radarrRequest('DELETE', `/api/v3/queue/${queueId}?removeFromClient=true&blocklist=false`);
}

/** Radarr queue record, as returned by the API (only the fields we read). */
interface RadarrQueueApiRecord {
  id?: number;
  movieId?: number;
  title?: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  status?: string;
  trackedDownloadStatus?: string;
  movie?: { title: string; year: number };
}

export async function fetchRadarrQueue(): Promise<Record<number, QueueRecord>> {
  const data: { records?: RadarrQueueApiRecord[] } | null = JSON.parse(await radarrRequest('GET', '/api/v3/queue'));

  const queueMap: Record<number, QueueRecord> = {};
  if (data && Array.isArray(data.records)) {
    data.records.forEach(record => {
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

import { DownloadInfo, Movie, QueueRecord } from '../types';
import { isMovieUpcoming } from './release';

export type MovieGroupKey = 'local' | 'downloading' | 'server' | 'upcoming' | 'missing';

export interface MovieGroup {
  readonly key: MovieGroupKey;
  readonly title: string;
  readonly movies: Movie[];
}

/** DOM id of a group's section on the movies screen (scroll target of the sidebar). */
export const movieGroupSectionId = (key: MovieGroupKey): string => `movie-section-${key}`;

/** DOM id of a group's heading (section label, focused after a jump from the sidebar). */
export const movieGroupHeadingId = (key: MovieGroupKey): string => `movie-group-${key}`;

/** Display order of the library groups. */
const GROUP_TITLES: ReadonlyArray<readonly [MovieGroupKey, string]> = [
  ['local', 'Mes films'],
  ['downloading', 'En téléchargement'],
  ['server', 'Sur le serveur'],
  ['upcoming', 'Bientôt disponibles'],
  ['missing', 'Introuvables'],
];

/** Which single group a library movie belongs to, rules checked by priority. */
export function getMovieGroupKey(
  movie: Movie,
  download: DownloadInfo | undefined,
  queueItem: QueueRecord | undefined
): MovieGroupKey {
  if (download?.status === 'completed') return 'local';
  if (download?.status === 'downloading' || download?.status === 'paused' || queueItem) return 'downloading';
  if (movie.hasFile && movie.movieFile) return 'server';
  if (isMovieUpcoming(movie)) return 'upcoming';
  return 'missing';
}

/**
 * Splits the library into exclusive groups (each movie appears once), in display order.
 * Empty groups are left out; movies keep their original order inside each group.
 */
export function groupMovies(
  movies: readonly Movie[],
  downloads: Readonly<Record<string, DownloadInfo>>,
  radarrQueue: Readonly<Record<number, QueueRecord>>
): MovieGroup[] {
  const buckets = new Map<MovieGroupKey, Movie[]>(GROUP_TITLES.map(([key]) => [key, []]));
  for (const movie of movies) {
    const key = getMovieGroupKey(movie, downloads[`movie-${movie.id}`], radarrQueue[movie.id]);
    buckets.get(key)?.push(movie);
  }
  return GROUP_TITLES
    .map(([key, title]) => ({ key, title, movies: buckets.get(key) ?? [] }))
    .filter(group => group.movies.length > 0);
}

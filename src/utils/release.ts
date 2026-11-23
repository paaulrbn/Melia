import { Movie } from '../types';

const UPCOMING_STATUSES = new Set<Movie['status']>(['tba', 'announced', 'inCinemas']);

/** True when Radarr says the movie is not out yet (no digital or physical release), so no file can exist. */
export function isMovieUpcoming(movie: Pick<Movie, 'status'>): boolean {
  return UPCOMING_STATUSES.has(movie.status);
}

/** Next known home release (digital or physical) still in the future, or null. */
export function getHomeReleaseDate(movie: Pick<Movie, 'digitalRelease' | 'physicalRelease'>): Date | null {
  const now = Date.now();
  const dates = [movie.digitalRelease, movie.physicalRelease]
    .map(value => (value ? new Date(value) : null))
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()) && date.getTime() > now)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

/** « Pas encore sorti » plus the expected date when Radarr knows it. */
export function describeUpcomingRelease(movie: Pick<Movie, 'digitalRelease' | 'physicalRelease'>): string {
  const date = getHomeReleaseDate(movie);
  if (!date) return 'Pas encore sorti';
  const formatted = date
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/ /g, ' ');
  return `Pas encore sorti, sortie prévue le ${formatted}`;
}

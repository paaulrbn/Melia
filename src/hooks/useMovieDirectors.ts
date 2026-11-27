import { useEffect, useState } from 'react';
import { fetchRadarrCredits } from '../services/radarr';
import { extractDirectors } from '../utils/credits';

const NO_DIRECTORS: readonly string[] = [];

/** Directors by Radarr movie id, kept for the session: credits rarely change. */
const directorsCache = new Map<number, readonly string[]>();
/** Requests on their way, shared by the prefetch and the page. */
const pending = new Map<number, Promise<readonly string[]>>();

function loadDirectors(movieId: number): Promise<readonly string[]> {
  const cached = directorsCache.get(movieId);
  if (cached) return Promise.resolve(cached);
  let request = pending.get(movieId);
  if (!request) {
    request = fetchRadarrCredits(movieId)
      .then(credits => {
        const names = extractDirectors(credits);
        directorsCache.set(movieId, names);
        return names;
      })
      .finally(() => pending.delete(movieId));
    pending.set(movieId, request);
  }
  return request;
}

/** Asks for the directors ahead of time, as soon as the poster is aimed at. */
export function prefetchMovieDirectors(movieId: number): void {
  if (directorsCache.has(movieId) || pending.has(movieId)) return;
  loadDirectors(movieId).catch(() => {
    // The page asks again when it opens
  });
}

export interface MovieDirectors {
  readonly names: readonly string[];
  /** Still on its way: the page keeps the line's room so nothing moves when it arrives. */
  readonly isLoading: boolean;
}

/**
 * Directors of a library movie. `null`: no Radarr id (search result), no request.
 */
export function useMovieDirectors(movieId: number | null): MovieDirectors {
  const [result, setResult] = useState<{ id: number; names: readonly string[] | null } | null>(null);

  useEffect(() => {
    if (movieId === null || directorsCache.has(movieId)) return;
    let isCurrent = true;
    loadDirectors(movieId)
      .then(names => {
        if (isCurrent) setResult({ id: movieId, names });
      })
      .catch(() => {
        // No director shown; the next opening tries again
        if (isCurrent) setResult({ id: movieId, names: null });
      });
    return () => {
      isCurrent = false;
    };
  }, [movieId]);

  if (movieId === null) return { names: NO_DIRECTORS, isLoading: false };
  const cached = directorsCache.get(movieId);
  if (cached) return { names: cached, isLoading: false };
  if (result?.id === movieId) return { names: result.names ?? NO_DIRECTORS, isLoading: false };
  return { names: NO_DIRECTORS, isLoading: true };
}

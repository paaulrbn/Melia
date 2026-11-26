import { useEffect, useState } from 'react';
import { fetchRadarrCredits } from '../services/radarr';
import { extractDirectors } from '../utils/credits';

const NO_DIRECTORS: readonly string[] = [];

/** Directors by Radarr movie id, kept for the session: credits rarely change. */
const directorsCache = new Map<number, readonly string[]>();

/**
 * Directors of a library movie, loaded in the background (empty until they arrive,
 * and on error: nothing to show). `null`: no Radarr id (search result), no request.
 */
export function useMovieDirectors(movieId: number | null): readonly string[] {
  const [loaded, setLoaded] = useState<{ id: number; names: readonly string[] } | null>(null);

  useEffect(() => {
    if (movieId === null || directorsCache.has(movieId)) return;
    let isCurrent = true;
    fetchRadarrCredits(movieId)
      .then(credits => {
        const names = extractDirectors(credits);
        directorsCache.set(movieId, names);
        // Another movie opened in the meantime: its own request answers for it
        if (isCurrent) setLoaded({ id: movieId, names });
      })
      .catch(() => {
        // No director shown; the next opening tries again
      });
    return () => {
      isCurrent = false;
    };
  }, [movieId]);

  if (movieId === null) return NO_DIRECTORS;
  return directorsCache.get(movieId) ?? (loaded?.id === movieId ? loaded.names : NO_DIRECTORS);
}

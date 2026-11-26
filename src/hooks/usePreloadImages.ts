import { useEffect, useMemo } from 'react';
import { preloadImages } from '../utils/preloadImages';

/**
 * Preloads the given image URLs in the background while the component is mounted.
 * Restarts only when the list itself changes, not on every render that rebuilds it.
 */
export function usePreloadImages(urls: readonly (string | null | undefined)[]): void {
  const key = useMemo(
    () => [...new Set(urls.filter((url): url is string => Boolean(url)))].join('\n'),
    [urls]
  );

  useEffect(() => {
    if (!key) return undefined;
    return preloadImages(key.split('\n'));
  }, [key]);
}

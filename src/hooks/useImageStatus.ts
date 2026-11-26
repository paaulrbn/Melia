import { useEffect, useState } from 'react';

/** 'shown': ready from the cache at once; 'faded-in': loaded after mount, to fade in. */
export type ImageStatus = 'pending' | 'shown' | 'faded-in' | 'error';

function initialStatus(url: string | null): ImageStatus {
  if (!url) return 'error';
  const img = new Image();
  img.src = url;
  return img.complete && img.naturalWidth > 0 ? 'shown' : 'pending';
}

/**
 * Load state of an image used as a CSS background, which has no load event of its own.
 * A cached image is 'shown' on the very first render, so it never fades.
 */
export function useImageStatus(url: string | null): ImageStatus {
  const [state, setState] = useState(() => ({ url, status: initialStatus(url) }));

  // New URL: start over during render, so the old status never shows with the new image
  let current = state;
  if (state.url !== url) {
    current = { url, status: initialStatus(url) };
    setState(current);
  }
  const { status } = current;

  useEffect(() => {
    if (!url || status !== 'pending') return undefined;
    let active = true;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img
      .decode()
      .then(() => {
        if (active) setState({ url, status: 'faded-in' });
      })
      .catch(() => {
        // decode() can reject on an image that did load: trust the pixel size
        if (active) setState({ url, status: img.naturalWidth > 0 ? 'faded-in' : 'error' });
      });
    return () => {
      active = false;
    };
  }, [url, status]);

  return status;
}

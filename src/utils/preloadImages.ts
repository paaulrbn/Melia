/**
 * Background image warm-up: fetches and decodes images before they reach the screen,
 * so grid posters are ready when scrolled into view (no pop-in, no decode on scroll).
 */

const BATCH_SIZE = 6;
const IDLE_TIMEOUT_MS = 1000;

// Shared across calls: an image decoded once is never fetched again by the preloader
const preloaded = new Set<string>();
const inFlight = new Set<string>();

type IdleHandle = { cancel: () => void };

function whenIdle(callback: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  const id = window.setTimeout(callback, 50);
  return { cancel: () => window.clearTimeout(id) };
}

function preloadOne(url: string): Promise<void> {
  inFlight.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img
    .decode()
    .then(() => {
      preloaded.add(url);
    })
    // A broken image is left to the card, which keeps its plain background
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(url);
    });
}

/**
 * Preloads `urls` in order, a few at a time and only while the main thread is idle.
 * Returns a cancel function: pending batches are dropped, images already requested finish.
 */
export function preloadImages(urls: readonly string[], batchSize = BATCH_SIZE): () => void {
  const queue = urls.filter(url => !preloaded.has(url));
  let cancelled = false;
  let pending: IdleHandle | null = null;

  const runBatch = () => {
    pending = null;
    if (cancelled) return;
    const batch: string[] = [];
    while (batch.length < batchSize && queue.length > 0) {
      const url = queue.shift() as string;
      if (!preloaded.has(url) && !inFlight.has(url) && !batch.includes(url)) batch.push(url);
    }
    if (batch.length === 0) return;
    void Promise.all(batch.map(preloadOne)).then(scheduleNext);
  };

  const scheduleNext = () => {
    if (cancelled || queue.length === 0) return;
    pending = whenIdle(runBatch);
  };

  scheduleNext();

  return () => {
    cancelled = true;
    pending?.cancel();
    pending = null;
  };
}

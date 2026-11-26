import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

type PosterStatus = 'pending' | 'shown' | 'faded-in' | 'error';

export interface PosterProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError'> {
  readonly src: string;
}

/**
 * Image that never pops in: shown at once when it is already in the cache, otherwise
 * faded in once loaded. A failed load renders nothing, so the parent background stays
 * (no broken-image icon).
 */
export function Poster({ src, className = '', alt = '', ...props }: Readonly<PosterProps>) {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<PosterStatus>('pending');

  // Before the first paint: a cached image shows straight away, without the fade
  useLayoutEffect(() => {
    const img = ref.current;
    if (!img) {
      // New source after a failed one: render the image again
      setStatus('pending');
      return;
    }
    if (img.complete) {
      setStatus(img.naturalWidth > 0 ? 'shown' : 'error');
    } else {
      setStatus('pending');
    }
  }, [src]);

  if (status === 'error') return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      decoding="async"
      className={['ui-poster', className].filter(Boolean).join(' ')}
      data-status={status}
      onLoad={() => setStatus(current => (current === 'pending' ? 'faded-in' : current))}
      onError={() => setStatus('error')}
      {...props}
    />
  );
}

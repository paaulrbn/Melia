import { Config, MovieImage } from '../types';

/**
 * TMDB size per cover type: Radarr and Sonarr hand out the original file (often 2000 x 3000 px),
 * far too heavy to decode for a grid card or a backdrop.
 */
const TMDB_SIZES: Record<string, string> = {
  poster: 'w500',
  fanart: 'w1280',
};

const TMDB_SIZE_PATTERN = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

export function getImageUrl(
  movie: { images?: MovieImage[] } | null | undefined,
  type: string
): string | null {
  if (!Array.isArray(movie?.images)) return null;
  const img = movie.images.find(i => i.coverType === type);
  if (!img?.remoteUrl) return null;
  let url = img.remoteUrl;
  const tmdbSize = TMDB_SIZES[type];
  if (tmdbSize && TMDB_SIZE_PATTERN.test(url)) {
    url = url.replace(TMDB_SIZE_PATTERN, `$1${tmdbSize}/`);
  } else if (type === 'poster' && url.includes('poster.jpg')) {
    url = url.replace('poster.jpg', 'poster-250.jpg');
  }
  return url || null;
}

/**
 * Media server URL for a file, without credentials: the Basic auth header is added on the Rust side
 * (downloader and local playback proxy), so the password never appears in a URL or a process argument.
 */
export function getStreamUrl(filePath: string, config: Config): string {
  const host = config['MEDIA_SERVER_HOST']?.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
  const rootPath = config['MEDIA_SERVER_ROOT_PATH'] || '/paul';

  let cleanPath = filePath;
  const dlIndex = cleanPath.indexOf('/downloads/');
  if (dlIndex !== -1) {
    cleanPath = rootPath.replace(/\/$/, '') + cleanPath.substring(dlIndex);
  }

  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

  return `https://${host}/${cleanPath.split('/').map(encodeURIComponent).join('/')}`;
}

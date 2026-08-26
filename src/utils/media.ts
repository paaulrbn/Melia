import { Config, MovieImage } from '../types';

export function getImageUrl(
  movie: { images: MovieImage[] },
  type: 'poster' | 'fanart' | string
): string {
  const img = movie.images.find(i => i.coverType === type);
  if (!img) return '';
  let url = img.remoteUrl;
  if (type === 'poster' && url.includes('poster.jpg')) {
    url = url.replace('poster.jpg', 'poster-250.jpg');
  }
  return url;
}

export function getStreamUrl(filePath: string, config: Config): string {
  const host = config['MEDIA_SERVER_HOST']?.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
  const user = config['MEDIA_SERVER_USERNAME'];
  const pass = config['MEDIA_SERVER_PASSWORD'];
  const rootPath = config['MEDIA_SERVER_ROOT_PATH'] || '/paul';

  let cleanPath = filePath;
  const dlIndex = cleanPath.indexOf('/downloads/');
  if (dlIndex !== -1) {
    cleanPath = rootPath.replace(/\/$/, '') + cleanPath.substring(dlIndex);
  }

  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

  if (user && pass) {
    return `https://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${cleanPath}`;
  }
  return `https://${host}/${cleanPath}`;
}

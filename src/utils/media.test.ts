import { describe, expect, it } from 'vitest';
import { getImageUrl } from './media';

const withImage = (coverType: string, remoteUrl: string) => ({ images: [{ coverType, remoteUrl }] });

describe('getImageUrl', () => {
  it('asks TMDB for a 500 px wide poster instead of the original file', () => {
    const item = withImage('poster', 'https://image.tmdb.org/t/p/original/abc.jpg');
    expect(getImageUrl(item, 'poster')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  it('asks TMDB for a 1280 px wide backdrop', () => {
    const item = withImage('fanart', 'https://image.tmdb.org/t/p/original/def.jpg');
    expect(getImageUrl(item, 'fanart')).toBe('https://image.tmdb.org/t/p/w1280/def.jpg');
  });

  it('replaces any TMDB size already in the URL', () => {
    const item = withImage('poster', 'http://image.tmdb.org/t/p/w780/abc.jpg');
    expect(getImageUrl(item, 'poster')).toBe('http://image.tmdb.org/t/p/w500/abc.jpg');
  });

  it('leaves TMDB images of other types untouched', () => {
    const url = 'https://image.tmdb.org/t/p/original/logo.png';
    expect(getImageUrl(withImage('clearlogo', url), 'clearlogo')).toBe(url);
  });

  it('leaves other hosts untouched', () => {
    const tvdb = 'https://artworks.thetvdb.com/banners/posters/123-1.jpg';
    const fanart = 'https://assets.fanart.tv/fanart/movies/1/moviebackground/x.jpg';
    expect(getImageUrl(withImage('poster', tvdb), 'poster')).toBe(tvdb);
    expect(getImageUrl(withImage('fanart', fanart), 'fanart')).toBe(fanart);
  });

  it('keeps the small poster-250.jpg variant for local posters', () => {
    const item = withImage('poster', 'http://radarr.local/MediaCover/1/poster.jpg');
    expect(getImageUrl(item, 'poster')).toBe('http://radarr.local/MediaCover/1/poster-250.jpg');
  });

  it('returns null without a matching image', () => {
    expect(getImageUrl(null, 'poster')).toBeNull();
    expect(getImageUrl({ images: [] }, 'poster')).toBeNull();
    expect(getImageUrl(withImage('fanart', 'https://x/y.jpg'), 'poster')).toBeNull();
  });
});

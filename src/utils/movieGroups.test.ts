import { describe, expect, it } from 'vitest';
import { DownloadInfo, Movie, QueueRecord } from '../types';
import { getMovieGroupKey, groupMovies } from './movieGroups';

function movie(id: number, extra: Partial<Movie> = {}): Movie {
  return { id, title: `Film ${id}`, year: 2020, overview: '', images: [], hasFile: false, status: 'released', ...extra };
}

function download(id: number, status: DownloadInfo['status']): DownloadInfo {
  return { id: `movie-${id}`, mediaType: 'movie', mediaId: id, title: '', progress: 0, stats: '', status };
}

const queueItem = (id: number): QueueRecord => ({ movieId: id, size: 100, sizeleft: 50 });
const onServer = { hasFile: true, movieFile: { path: '/a.mkv', size: 1 } };

describe('getMovieGroupKey', () => {
  it('puts a finished local download in « Mes films », before anything else', () => {
    expect(getMovieGroupKey(movie(1, onServer), download(1, 'completed'), queueItem(1))).toBe('local');
  });

  it('puts a local download in progress or paused, or a Radarr queue item, in « En téléchargement »', () => {
    expect(getMovieGroupKey(movie(1, onServer), download(1, 'downloading'), undefined)).toBe('downloading');
    expect(getMovieGroupKey(movie(1, onServer), download(1, 'paused'), undefined)).toBe('downloading');
    expect(getMovieGroupKey(movie(1), undefined, queueItem(1))).toBe('downloading');
  });

  it('needs both hasFile and movieFile for « Sur le serveur »', () => {
    expect(getMovieGroupKey(movie(1, onServer), undefined, undefined)).toBe('server');
    expect(getMovieGroupKey(movie(1, { hasFile: true }), undefined, undefined)).toBe('missing');
  });

  it('separates movies not out yet from released movies without a file', () => {
    expect(getMovieGroupKey(movie(1, { status: 'inCinemas' }), undefined, undefined)).toBe('upcoming');
    expect(getMovieGroupKey(movie(1, { status: 'released' }), undefined, undefined)).toBe('missing');
    expect(getMovieGroupKey(movie(1, { monitored: false }), undefined, undefined)).toBe('missing');
  });

  it('falls back to the server state when a local download failed', () => {
    expect(getMovieGroupKey(movie(1, onServer), download(1, 'error'), undefined)).toBe('server');
  });
});

describe('groupMovies', () => {
  it('returns non-empty groups in display order, each movie once, keeping the library order', () => {
    const movies = [
      movie(1, onServer),
      movie(2, { status: 'released' }),
      movie(3, onServer),
      movie(4, { status: 'announced' }),
      movie(5, onServer),
    ];
    const groups = groupMovies(movies, { 'movie-5': download(5, 'completed') }, {});
    expect(groups.map(g => g.title)).toEqual(['Mes films', 'Sur le serveur', 'Bientôt disponibles', 'Introuvables']);
    expect(groups.map(g => g.movies.map(m => m.id))).toEqual([[5], [1, 3], [4], [2]]);
  });
});

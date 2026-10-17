import { describe, expect, it } from 'vitest';
import {
  computeSyncStatus,
  getEpisodeDownloadRelativePath,
  getMovieDownloadFilename,
} from './downloads';

describe('computeSyncStatus', () => {
  it('marks a file as complete only when it reaches the exact expected size', () => {
    const sync = computeSyncStatus(10_000, 10_000);
    expect(sync.isComplete).toBe(true);
    expect(sync.status).toBe('completed');
    expect(sync.progress).toBe(100);
  });

  it('keeps a truncated file as paused, even when it is 99% there', () => {
    const sync = computeSyncStatus(9_900, 10_000);
    expect(sync.isComplete).toBe(false);
    expect(sync.status).toBe('paused');
    expect(sync.progress).toBe(99);
  });

  it('treats an unknown expected size as complete', () => {
    expect(computeSyncStatus(1_234, 0).isComplete).toBe(true);
  });

  it('caps progress at 100', () => {
    expect(computeSyncStatus(20_000, 10_000).progress).toBe(100);
  });
});

describe('getMovieDownloadFilename', () => {
  it('builds "Title (Year).ext" from the server file extension', () => {
    const movie = { title: 'Heat', year: 1995, movieFile: { path: '/movies/Heat.mp4' } };
    expect(getMovieDownloadFilename(movie)).toBe('Heat (1995).mp4');
  });

  it('defaults to mkv without a file', () => {
    expect(getMovieDownloadFilename({ title: 'Heat', year: 1995 })).toBe('Heat (1995).mkv');
  });

  it('never creates sub-folders from a slash in the title', () => {
    const name = getMovieDownloadFilename({ title: 'AC/DC: Let There Be Rock', year: 1980 });
    expect(name).not.toContain('/');
    expect(name).toBe('AC_DC: Let There Be Rock (1980).mkv');
  });
});

describe('getEpisodeDownloadRelativePath', () => {
  const series = { title: 'Dark', year: 2017 };

  it('builds Series (Year)/Season NN/file', () => {
    const path = getEpisodeDownloadRelativePath(series, {
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Lies',
      episodeFile: { path: '/tv/Dark/s01e02.mkv' },
    });
    expect(path).toBe('Dark (2017)/Season 01/Dark - S01E02 - Lies.mkv');
  });

  it('keeps exactly three path segments when titles contain separators', () => {
    const path = getEpisodeDownloadRelativePath(
      { title: 'AC/DC', year: 2000 },
      { seasonNumber: 2, episodeNumber: 10, title: 'A/B: C' }
    );
    expect(path.split('/')).toHaveLength(3);
  });
});

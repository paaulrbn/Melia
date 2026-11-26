import { describe, expect, it } from 'vitest';
import {
  describeEpisodeAbsence,
  formatAirDate,
  getEpisodeAbsence,
  formatEpisodeCount,
  formatEpisodeTag,
  formatSeasonCount,
  getSeasonNumbers,
  getSeriesStatusText,
  isEpisodeMissing,
  sortEpisodes,
} from './series';

describe('getSeriesStatusText', () => {
  it('names the Sonarr statuses', () => {
    expect(getSeriesStatusText('continuing')).toBe('En cours');
    expect(getSeriesStatusText('ended')).toBe('Terminée');
    expect(getSeriesStatusText('upcoming')).toBe('À venir');
  });

  it('says nothing for an unknown status', () => {
    expect(getSeriesStatusText('deleted')).toBe('');
    expect(getSeriesStatusText(undefined)).toBe('');
  });
});

describe('counts', () => {
  it('pluralises seasons', () => {
    expect(formatSeasonCount(1)).toBe('1 saison');
    expect(formatSeasonCount(4)).toBe('4 saisons');
  });

  it('keeps the episode count on one line', () => {
    expect(formatEpisodeCount(0, 1)).toBe('0 / 1 épisode');
    expect(formatEpisodeCount(12, 24)).toBe('12 / 24 épisodes');
  });

  it('writes the episode tag', () => {
    expect(formatEpisodeTag(1, 3)).toBe('S01E03');
    expect(formatEpisodeTag(12, 10)).toBe('S12E10');
  });
});

describe('getSeasonNumbers', () => {
  it('drops the specials and sorts', () => {
    expect(getSeasonNumbers([{ seasonNumber: 3 }, { seasonNumber: 0 }, { seasonNumber: 1 }])).toEqual([1, 3]);
  });

  it('falls back to season 1', () => {
    expect(getSeasonNumbers(undefined)).toEqual([1]);
    expect(getSeasonNumbers([])).toEqual([1]);
    expect(getSeasonNumbers([{ seasonNumber: 0 }])).toEqual([1]);
  });
});

describe('sortEpisodes', () => {
  it('sorts by season then episode, without touching the input', () => {
    const input = [
      { seasonNumber: 2, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 1, episodeNumber: 1 },
    ];
    expect(sortEpisodes(input)).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 1 },
    ]);
    expect(input[0]).toEqual({ seasonNumber: 2, episodeNumber: 1 });
  });
});

describe('isEpisodeMissing', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();
  const base = { hasFile: false, monitored: true, airDateUtc: '2026-01-01T00:00:00Z' };

  it('is missing when aired, watched, without file or transfer', () => {
    expect(isEpisodeMissing(base, false, now)).toBe(true);
    expect(isEpisodeMissing({ ...base, airDateUtc: undefined }, false, now)).toBe(true);
  });

  it('is not missing when something covers it', () => {
    expect(isEpisodeMissing({ ...base, hasFile: true }, false, now)).toBe(false);
    expect(isEpisodeMissing({ ...base, monitored: false }, false, now)).toBe(false);
    expect(isEpisodeMissing(base, true, now)).toBe(false);
  });

  it('is not missing before it airs', () => {
    expect(isEpisodeMissing({ ...base, airDateUtc: '2026-02-01T00:00:00Z' }, false, now)).toBe(false);
  });
});

describe('getEpisodeAbsence', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();
  const base = { hasFile: false, monitored: true, airDateUtc: '2026-01-01T00:00:00Z' };

  it('is null when the file is there or a transfer is running', () => {
    expect(getEpisodeAbsence({ ...base, hasFile: true }, false, now)).toBeNull();
    expect(getEpisodeAbsence(base, true, now)).toBeNull();
  });

  it('tells an episode that has not aired yet', () => {
    expect(getEpisodeAbsence({ ...base, airDateUtc: '2026-02-01T00:00:00Z' }, false, now)).toBe('upcoming');
  });

  it('tells a missing episode from one that is just not there', () => {
    expect(getEpisodeAbsence(base, false, now)).toBe('missing');
    expect(getEpisodeAbsence({ ...base, monitored: false }, false, now)).toBe('unavailable');
  });
});

describe('formatAirDate and describeEpisodeAbsence', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();

  it('leaves the year out in the current year only', () => {
    expect(formatAirDate('2026-03-15T12:00:00Z', now)).not.toContain('2026');
    expect(formatAirDate('2027-03-15T12:00:00Z', now)).toContain('2027');
    expect(formatAirDate('not a date', now)).toBe('');
  });

  it('words each reason', () => {
    expect(describeEpisodeAbsence('missing')).toBe('Manquant');
    expect(describeEpisodeAbsence('unavailable')).toBe('Pas encore sur le serveur');
    expect(describeEpisodeAbsence('upcoming')).toBe('À venir');
    expect(describeEpisodeAbsence('upcoming', '2026-03-15T12:00:00Z', now)).toMatch(/^À venir, 15 /);
  });
});

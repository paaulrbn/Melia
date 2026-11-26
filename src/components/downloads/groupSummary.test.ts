import { describe, expect, it } from 'vitest';
import { describeGroupSummary, formatEpisodeLabel } from './transferDetails';

describe('describeGroupSummary', () => {
  it('counts the episodes and adds the time left when it is known', () => {
    // The duration keeps its number and unit together with a non-breaking space
    expect(describeGroupSummary(3, 12 * 60)).toBe('3 épisodes, reste 12 min');
    expect(describeGroupSummary(2, 30)).toBe('2 épisodes, reste moins d’une minute');
  });

  it('says only the count when nothing gives a time', () => {
    expect(describeGroupSummary(2, 0)).toBe('2 épisodes');
    expect(describeGroupSummary(1, 0)).toBe('1 épisode');
  });
});

describe('formatEpisodeLabel', () => {
  it('joins the tag and the title', () => {
    expect(formatEpisodeLabel('S01E02', 'Pilote', true)).toBe('S01E02 Pilote');
  });

  it('keeps the tag alone when the title says nothing more', () => {
    expect(formatEpisodeLabel('S01E02', 'Épisode 2', false)).toBe('S01E02');
    expect(formatEpisodeLabel('S01E02', '', true)).toBe('S01E02');
  });
});

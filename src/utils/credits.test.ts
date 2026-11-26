import { describe, expect, it } from 'vitest';
import { extractDirectors, formatNameList } from './credits';

describe('extractDirectors', () => {
  it('keeps only crew members whose job is Director', () => {
    expect(
      extractDirectors([
        { personName: 'Matthew McConaughey', type: 'cast' },
        { personName: 'Christopher Nolan', type: 'crew', job: 'Director' },
        { personName: 'Hans Zimmer', type: 'crew', job: 'Original Music Composer' },
        { personName: 'Emma Thomas', type: 'crew', job: 'Producer' },
      ])
    ).toEqual(['Christopher Nolan']);
  });

  it('removes duplicates and blank names, keeping the original order', () => {
    expect(
      extractDirectors([
        { personName: 'Joel Coen', type: 'crew', job: 'Director' },
        { personName: 'Ethan Coen', type: 'crew', job: 'Director' },
        { personName: ' Joel Coen ', type: 'crew', job: 'Director' },
        { personName: '', type: 'crew', job: 'Director' },
        { type: 'crew', job: 'Director' },
      ])
    ).toEqual(['Joel Coen', 'Ethan Coen']);
  });

  it('returns an empty list for missing or malformed data', () => {
    expect(extractDirectors([])).toEqual([]);
    expect(extractDirectors(null)).toEqual([]);
    expect(extractDirectors(undefined)).toEqual([]);
    expect(extractDirectors({} as never)).toEqual([]);
  });
});

describe('formatNameList', () => {
  it('joins names in French', () => {
    expect(formatNameList([])).toBe('');
    expect(formatNameList(['A'])).toBe('A');
    expect(formatNameList(['A', 'B'])).toBe('A et B');
    expect(formatNameList(['A', 'B', 'C'])).toBe('A, B et C');
  });
});

import { describe, expect, it } from 'vitest';
import type { Series } from '../types';
import { buildSeriesGroups, seriesGroupHeadingId, seriesGroupSectionId } from './seriesGroups';

const show = (id: number) => ({ id, title: `Série ${id}` }) as Series;

describe('buildSeriesGroups', () => {
  it('keeps the display order and leaves empty groups out', () => {
    const groups = buildSeriesGroups([], [show(1), show(2)], [show(3)]);
    expect(groups.map(group => group.key)).toEqual(['server', 'waiting']);
    expect(groups[0].series.map(s => s.id)).toEqual([1, 2]);
  });

  it('lets a series appear in two groups', () => {
    const groups = buildSeriesGroups([show(1)], [show(1)], []);
    expect(groups.map(group => group.title)).toEqual(['Mes séries', 'Sur le serveur']);
  });

  it('gives nothing for an empty library', () => {
    expect(buildSeriesGroups([], [], [])).toEqual([]);
  });
});

describe('ids', () => {
  it('differ between sections and headings', () => {
    expect(seriesGroupSectionId('local')).toBe('series-section-local');
    expect(seriesGroupHeadingId('local')).toBe('series-group-local');
  });
});

import type { Series } from '../types';

export type SeriesGroupKey = 'local' | 'server' | 'waiting';

export interface SeriesLibraryGroup {
  readonly key: SeriesGroupKey;
  readonly title: string;
  readonly series: Series[];
}

/** DOM id of a group's section on the series screen (scroll target of the sidebar). */
export const seriesGroupSectionId = (key: SeriesGroupKey): string => `series-section-${key}`;

/** DOM id of a group's heading (section label, focused after a jump from the sidebar). */
export const seriesGroupHeadingId = (key: SeriesGroupKey): string => `series-group-${key}`;

/**
 * Sections of the series library, in display order, empty ones left out. A series can sit
 * in two of them (downloaded here and available on the server).
 */
export function buildSeriesGroups(
  local: readonly Series[],
  server: readonly Series[],
  waiting: readonly Series[]
): SeriesLibraryGroup[] {
  const groups: SeriesLibraryGroup[] = [
    { key: 'local', title: 'Mes séries', series: [...local] },
    { key: 'server', title: 'Sur le serveur', series: [...server] },
    { key: 'waiting', title: 'En attente', series: [...waiting] },
  ];
  return groups.filter(group => group.series.length > 0);
}

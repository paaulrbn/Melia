import type { TabType } from '../../types';

/** Name of each main page: sidebar-less tabs in the top row, and the page heading read by screen readers. */
export const PAGE_TITLES: Record<TabType, string> = {
  movies: 'Films',
  series: 'Séries',
  downloads: 'Téléchargements',
  settings: 'Paramètres',
};

/**
 * Pages a movie page can open over, with the accessible name of its back button. The
 * movie page remembers the one it was opened from and goes back to it.
 */
export const DETAIL_BACK_LABELS: Partial<Record<TabType, string>> = {
  movies: 'Retour aux films',
  downloads: 'Retour aux téléchargements',
};

/** Page heading (screen readers only): takes the focus back when nothing better is left. */
export const PAGE_HEADING_ID = 'page-title';

/** Main pages in the sidebar's order (Paramètres last, as at its bottom). */
export const PAGE_ORDER: readonly TabType[] = ['movies', 'series', 'downloads', 'settings'];

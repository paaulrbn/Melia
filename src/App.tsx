import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { DownloadInfo, Episode, LookupMovie, LookupSeries, Movie, Series, TabType, UnifiedQueueItem } from './types';
import { useConfig } from './hooks/useConfig';
import { useDownloads } from './hooks/useDownloads';
import { useMovies } from './hooks/useMovies';
import { useSeries } from './hooks/useSeries';
import { useSearch } from './hooks/useSearch';
import { useUpdater } from './hooks/useUpdater';
import { useChangelog } from './hooks/useChangelog';
import { useScrollSpy } from './hooks/useScrollSpy';
import { useBackForward } from './hooks/useBackForward';
import { isEditableTarget, useSidebar } from './hooks/useSidebar';
import { playVideo } from './services/player';
import { MovieGroupKey, movieGroupHeadingId, movieGroupSectionId } from './utils/movieGroups';
import {
  SeriesGroupKey,
  buildSeriesGroups,
  seriesGroupHeadingId,
  seriesGroupSectionId,
} from './utils/seriesGroups';

import { StatusBanner } from './components/common/StatusBanner';
import { Sidebar } from './components/layout/Sidebar';
import { PageToolbar, type PageToolbarSearch } from './components/layout/PageToolbar';
import { TopTabs } from './components/layout/TopTabs';
import { DETAIL_BACK_LABELS, PAGE_HEADING_ID, PAGE_TITLES } from './components/layout/navigation';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { WindowBar } from './components/layout/WindowBar';
import { MoviesView } from './components/movies/MoviesView';
import { MovieDetailView } from './components/movies/MovieDetailView';
import { MEDIA_DETAIL_HEADING_ID } from './components/media/MediaDetailLayout';
import { AddMovieView } from './components/movies/AddMovieView';
import { SeriesView } from './components/series/SeriesView';
import { SeriesDetailView } from './components/series/SeriesDetailView';
import { AddSeriesView } from './components/series/AddSeriesView';
import { DownloadsView } from './components/downloads/DownloadsView';
import { SettingsView } from './components/settings/SettingsView';
import { ConfigImportModal } from './components/settings/ConfigImportModal';
import { ChangelogModal } from './components/changelog/ChangelogModal';

import './App.css';

const SIDEBAR_ID = 'app-sidebar';

/**
 * Content of the detail page: a library movie or series, or a search result to add.
 * Only one is open at a time.
 */
type DetailPage =
  | { kind: 'movie'; movie: Movie }
  | { kind: 'add'; movie: LookupMovie }
  | { kind: 'series'; series: Series }
  | { kind: 'add-series'; series: LookupSeries };

function detailPageKey(page: DetailPage): string {
  switch (page.kind) {
    case 'movie':
      return `movie-${page.movie.id}`;
    case 'add':
      return `add-${page.movie.tmdbId}`;
    case 'series':
      return `series-${page.series.id}`;
    case 'add-series':
      return `add-series-${page.series.tvdbId}`;
  }
}

/** The object the page shows: a new one means the page content changed. */
function detailPageSubject(page: DetailPage): object {
  return page.kind === 'movie' || page.kind === 'add' ? page.movie : page.series;
}

/** Page left with "back": what it showed and the page it was opened from. */
interface ForwardEntry {
  readonly page: DetailPage;
  readonly from: TabType;
}

/** Laid out on screen: the tab views not shown stay mounted with `display: none`. */
function isRendered(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0;
}

const EPISODE_ID_REGEX = /^episode-(\d+)$/;
const EPISODE_SEASON_REGEX = /-s(\d+)e(\d+)/i;

function resolveSeriesForResume(dl: DownloadInfo, seriesList: Series[]): Series | undefined {
  return dl.seriesId
    ? seriesList.find(item => item.id === dl.seriesId)
    : seriesList.find(
        item => item.title.trim().toLowerCase() === dl.title.trim().toLowerCase()
      );
}

function resolveDirectEpisodeId(id: string, dl: DownloadInfo): number | undefined {
  if (typeof dl.mediaId === 'number' && !Number.isNaN(dl.mediaId) && dl.mediaId > 0) {
    return dl.mediaId;
  }
  const epMatch = EPISODE_ID_REGEX.exec(id);
  return epMatch ? Number(epMatch[1]) : undefined;
}

function resolveTargetEpisode(
  id: string,
  dl: DownloadInfo,
  episodes: Episode[] | undefined
): Episode | undefined {
  if (!episodes || episodes.length === 0) return undefined;

  const directEpId = resolveDirectEpisodeId(id, dl);
  if (directEpId) {
    const match = episodes.find(e => e.id === directEpId);
    if (match) return match;
  }

  if (dl.seasonNumber !== undefined && dl.episodeNumber !== undefined) {
    const match = episodes.find(
      e => e.seasonNumber === dl.seasonNumber && e.episodeNumber === dl.episodeNumber
    );
    if (match) return match;
  }

  const match = EPISODE_SEASON_REGEX.exec(id);
  if (match) {
    const sNum = Number.parseInt(match[1], 10);
    const eNum = Number.parseInt(match[2], 10);
    return episodes.find(e => e.seasonNumber === sNum && e.episodeNumber === eNum);
  }

  return undefined;
}

async function loadSeriesEpisodesForResume(
  series: Series,
  seriesManager: ReturnType<typeof useSeries>
): Promise<Episode[] | undefined> {
  let episodes = seriesManager.episodesCache[series.id];
  if (!episodes && seriesManager.selectedSeries?.id === series.id) {
    episodes = seriesManager.selectedSeriesEpisodes;
  }
  if (!episodes || episodes.length === 0) {
    episodes = await seriesManager.loadSeriesEpisodes(series.id);
  }
  return episodes;
}

async function resumeEpisodeDownload(
  id: string,
  downloadsManager: ReturnType<typeof useDownloads>,
  seriesManager: ReturnType<typeof useSeries>,
  config: ReturnType<typeof useConfig>['config']
): Promise<void> {
  const dl = downloadsManager.downloads[id];
  if (!dl) return;

  const s = resolveSeriesForResume(dl, seriesManager.series);
  if (!s) return;

  const episodes = await loadSeriesEpisodesForResume(s, seriesManager);
  const targetEp = resolveTargetEpisode(id, dl, episodes);

  if (targetEp) {
    if (id !== `episode-${targetEp.id}`) {
      await downloadsManager.handleDeleteDownload(id, false);
    }
    await downloadsManager.handleDownloadEpisode(s, targetEp, config);
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('movies');

  // Core Hooks
  const updater = useUpdater();
  const downloadsManager = useDownloads();
  const configManager = useConfig();
  const changelogManager = useChangelog(updater.appInfo?.version);

  const handleMoviesFetched = useCallback(
    (fetchedMovies: Movie[]) => {
      const activeDir =
        downloadsManager.downloadDir || updater.appInfo?.default_download_dir || '';
      if (activeDir) {
        void downloadsManager.syncWithDisk(fetchedMovies, [], activeDir);
      }
    },
    [downloadsManager.downloadDir, downloadsManager.syncWithDisk, updater.appInfo?.default_download_dir]
  );

  const handleAutoDownloadReady = useCallback(
    (movie: Movie) => downloadsManager.handleDownloadMovie(movie, configManager.config),
    [downloadsManager, configManager.config]
  );

  const moviesManager = useMovies({
    config: configManager.config,
    downloads: downloadsManager.downloads,
    onMoviesFetched: handleMoviesFetched,
    onAutoDownloadReady: handleAutoDownloadReady,
  });

  const seriesManager = useSeries({
    config: configManager.config,
    downloads: downloadsManager.downloads,
  });

  // Resync downloads with disk whenever download directory or library changes
  useEffect(() => {
    const activeDir =
      downloadsManager.downloadDir || updater.appInfo?.default_download_dir || '';
    if (activeDir) {
      const seriesList: { series: Series; episodes: Episode[] }[] = [];
      if (seriesManager.selectedSeries) {
        seriesList.push({
          series: seriesManager.selectedSeries,
          episodes: seriesManager.selectedSeriesEpisodes,
        });
      }
      for (const [sIdStr, eps] of Object.entries(seriesManager.episodesCache)) {
        const sId = Number(sIdStr);
        if (seriesManager.selectedSeries?.id !== sId) {
          const s = seriesManager.series.find(item => item.id === sId);
          if (s && eps.length) {
            seriesList.push({ series: s, episodes: eps });
          }
        }
      }
      void downloadsManager.syncWithDisk(
        moviesManager.movies,
        seriesList,
        activeDir,
        seriesManager.series
      );
    }
  }, [
    downloadsManager.downloadDir,
    moviesManager.movies,
    seriesManager.series,
    seriesManager.selectedSeries,
    seriesManager.selectedSeriesEpisodes,
    seriesManager.episodesCache,
    updater.appInfo?.default_download_dir,
    downloadsManager.syncWithDisk,
  ]);

  const searchManager = useSearch(configManager.config);

  const unifiedServerQueue = useMemo<UnifiedQueueItem[]>(() => {
    // Radarr's queue only carries the release name ("Film (2014) (2160p BluRay ...)") unless the movie is
    // included: the real title comes from the queue record, then from the library.
    const movieItems: UnifiedQueueItem[] = Object.values(moviesManager.radarrQueue).map(q => {
      const knownMovie = q.movie ?? moviesManager.movies.find(m => m.id === q.movieId);
      return {
        id: `radarr-${q.id || q.movieId}`,
        mediaType: 'movie',
        mediaId: q.movieId,
        title: knownMovie?.title ?? q.title ?? 'Film',
        size: q.size,
        sizeleft: q.sizeleft,
        timeleft: q.timeleft,
        status: q.status,
        trackedDownloadStatus: q.trackedDownloadStatus,
        queueId: q.id,
      };
    });
    return [...movieItems, ...seriesManager.sonarrQueue];
  }, [moviesManager.radarrQueue, moviesManager.movies, seriesManager.sonarrQueue]);

  const handleCancelServerQueueItem = useCallback(
    async (item: UnifiedQueueItem) => {
      const qId = item.queueId ?? Number(item.id.replace(/^(radarr|sonarr)-/, ''));
      if (!qId) return;
      if (item.mediaType === 'movie') {
        await moviesManager.handleCancelQueueItem(qId);
      } else {
        await seriesManager.handleCancelQueueItem(qId);
      }
    },
    [moviesManager, seriesManager]
  );

  const handleResumeDownload = useCallback(
    async (id: string) => {
      if (id.startsWith('movie-')) {
        const movieId = Number(id.replace('movie-', ''));
        const m = moviesManager.movies.find(item => item.id === movieId);
        if (m) await downloadsManager.handleDownloadMovie(m, configManager.config);
      } else if (id.startsWith('episode-')) {
        await resumeEpisodeDownload(id, downloadsManager, seriesManager, configManager.config);
      }
    },
    [moviesManager, downloadsManager, configManager.config, seriesManager]
  );

  const totalActiveDownloads = useMemo(() => {
    return (
      downloadsManager.activeCount +
      Object.keys(moviesManager.radarrQueue).length +
      seriesManager.sonarrQueue.length
    );
  }, [downloadsManager.activeCount, moviesManager.radarrQueue, seriesManager.sonarrQueue]);

  const sidebar = useSidebar();

  // Detail page: shown in the content area in place of the list, which stays mounted (and
  // scrolled where it was) underneath. A library movie or series, or one found by the
  // search that can be added; never two at once.
  const { selectedMovie, setSelectedMovie, selectMovie, addingMovie, openAddMovie, closeAddMovie } =
    moviesManager;
  const { selectedSeries, selectSeries, addingSeries, openAddSeries, closeAddSeries } = seriesManager;
  // Page the detail page was opened from (Films, Séries, Téléchargements): it opens over
  // that page, which stays selected in the sidebar, and "back" returns to it
  const [detailFrom, setDetailFrom] = useState<TabType>('movies');
  // Library refreshes (queue end, focus, every 5 min) reach the open page
  const liveMovie = selectedMovie
    ? (moviesManager.movies.find(m => m.id === selectedMovie.id) ?? selectedMovie)
    : null;
  const liveSeries = selectedSeries
    ? (seriesManager.series.find(s => s.id === selectedSeries.id) ?? selectedSeries)
    : null;
  const openPage = useMemo<DetailPage | null>(() => {
    if (activeTab !== detailFrom) return null;
    if (liveMovie) return { kind: 'movie', movie: liveMovie };
    if (addingMovie) return { kind: 'add', movie: addingMovie };
    if (liveSeries) return { kind: 'series', series: liveSeries };
    if (addingSeries) return { kind: 'add-series', series: addingSeries };
    return null;
  }, [activeTab, detailFrom, liveMovie, addingMovie, liveSeries, addingSeries]);
  const isDetailOpen = openPage !== null;
  const isSeriesDetail = openPage?.kind === 'series' || openPage?.kind === 'add-series';
  // Kept after closing so the page can slide out, then dropped (see onTransitionEnd)
  const [closingPage, setClosingPage] = useState<DetailPage | null>(null);
  if (openPage && detailPageSubject(openPage) !== (closingPage && detailPageSubject(closingPage))) {
    setClosingPage(openPage);
  }
  // Page a swipe forward is dragging in: rendered off screen before it is opened
  const [previewPage, setPreviewPage] = useState<DetailPage | null>(null);
  const isPreview = openPage === null && previewPage !== null;
  const detailPage = openPage ?? previewPage ?? closingPage;
  const openPageKey = openPage ? detailPageKey(openPage) : null;
  // Movie added from the search a moment ago: its page says the server search has started
  const [justAddedMovieId, setJustAddedMovieId] = useState<number | null>(null);

  const listPaneRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<HTMLDivElement>(null);
  // Poster that opened the page, and (on return) the selector of the library item whose
  // poster takes the focus back when that poster is gone
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const focusReturnRef = useRef<{ selector: string | null } | null>(null);
  // Bumped by every page change: an addition that ends later only moves on if nothing changed
  const pageChangeRef = useRef(0);

  // Page left with "back", reopened by "forward" (mouse button, swipe), like a browser,
  // over the page it was opened from. Only the detail page is in this history, not the
  // tabs: any other way of leaving it (tab, sidebar group, search, another page,
  // deletion) forgets it.
  const forwardPageRef = useRef<ForwardEntry | null>(null);

  // Nothing selected, nothing being added: the state every page change starts from
  const clearDetailState = useCallback(() => {
    setSelectedMovie(null);
    closeAddMovie();
    void selectSeries(null);
    closeAddSeries();
  }, [setSelectedMovie, closeAddMovie, selectSeries, closeAddSeries]);

  /** `from`: the page it opens over and goes back to (Films unless said otherwise). */
  const openMovieDetail = useCallback(
    (movie: Movie, trigger?: HTMLElement, from: TabType = 'movies') => {
      pageChangeRef.current += 1;
      forwardPageRef.current = null;
      detailTriggerRef.current = trigger ?? null;
      setJustAddedMovieId(null);
      clearDetailState();
      setDetailFrom(from);
      setActiveTab(from);
      void selectMovie(movie);
    },
    [selectMovie, clearDetailState]
  );

  const openMovieDetailFromDownloads = useCallback(
    (movie: Movie, trigger?: HTMLElement) => openMovieDetail(movie, trigger, 'downloads'),
    [openMovieDetail]
  );

  // Search results only exist on the Films page
  const openAddMovieDetail = useCallback(
    (movie: LookupMovie, trigger?: HTMLElement) => {
      pageChangeRef.current += 1;
      forwardPageRef.current = null;
      detailTriggerRef.current = trigger ?? null;
      clearDetailState();
      setDetailFrom('movies');
      setActiveTab('movies');
      openAddMovie(movie);
    },
    [clearDetailState, openAddMovie]
  );

  /** `from`: the page it opens over and goes back to (Séries unless said otherwise). */
  const openSeriesDetail = useCallback(
    (series: Series, trigger?: HTMLElement, from: TabType = 'series') => {
      pageChangeRef.current += 1;
      forwardPageRef.current = null;
      detailTriggerRef.current = trigger ?? null;
      clearDetailState();
      setDetailFrom(from);
      setActiveTab(from);
      void selectSeries(series);
    },
    [selectSeries, clearDetailState]
  );

  const openSeriesDetailFromDownloads = useCallback(
    (series: Series, trigger?: HTMLElement) => openSeriesDetail(series, trigger, 'downloads'),
    [openSeriesDetail]
  );

  // Search results only exist on the Séries page
  const openAddSeriesDetail = useCallback(
    (series: LookupSeries, trigger?: HTMLElement) => {
      pageChangeRef.current += 1;
      forwardPageRef.current = null;
      detailTriggerRef.current = trigger ?? null;
      clearDetailState();
      setDetailFrom('series');
      setActiveTab('series');
      void openAddSeries(series);
    },
    [clearDetailState, openAddSeries]
  );

  /** `restoreFocus`: going back. A tab, a group or the search keep their own focus. */
  const closeDetail = useCallback(
    (restoreFocus: boolean) => {
      pageChangeRef.current += 1;
      forwardPageRef.current = null;
      let selector: string | null = null;
      if (selectedMovie) selector = `[data-movie-id="${selectedMovie.id}"]`;
      else if (selectedSeries) selector = `[data-series-id="${selectedSeries.id}"]`;
      focusReturnRef.current = restoreFocus ? { selector } : null;
      clearDetailState();
    },
    [selectedMovie, selectedSeries, clearDetailState]
  );

  // One path for every "back": header button, Escape, mouse button, trackpad swipe
  const goBack = useCallback(() => {
    if (!openPage) return;
    closeDetail(true);
    forwardPageRef.current = { page: openPage, from: detailFrom };
  }, [openPage, detailFrom, closeDetail]);

  // Only from the page it was left for: a page opened from the downloads does not
  // reappear over the movies, and the other way round
  const movies = moviesManager.movies;
  const seriesList = seriesManager.series;
  // The page "forward" would open now, or null when there is none. Added in the meantime:
  // its library page instead. Removed from the library in the meantime: nothing to reopen.
  const resolveForward = useCallback((): ForwardEntry | null => {
    const entry = forwardPageRef.current;
    if (!entry || activeTab !== entry.from || isDetailOpen) return null;
    const { page, from } = entry;
    switch (page.kind) {
      case 'add': {
        const added = movies.find(m => m.tmdbId === page.movie.tmdbId);
        return added ? { page: { kind: 'movie', movie: added }, from } : entry;
      }
      case 'movie': {
        const current = movies.find(m => m.id === page.movie.id);
        return current ? { page: { kind: 'movie', movie: current }, from } : null;
      }
      case 'add-series': {
        const added = seriesList.find(s => s.tvdbId === page.series.tvdbId);
        return added ? { page: { kind: 'series', series: added }, from } : entry;
      }
      case 'series': {
        const current = seriesList.find(s => s.id === page.series.id);
        return current ? { page: { kind: 'series', series: current }, from } : null;
      }
    }
  }, [activeTab, isDetailOpen, movies, seriesList]);

  const goForward = useCallback(() => {
    setPreviewPage(null);
    const target = resolveForward();
    if (!target) {
      const entry = forwardPageRef.current;
      if (entry && activeTab === entry.from && !isDetailOpen) forwardPageRef.current = null;
      return;
    }
    const { page, from } = target;
    switch (page.kind) {
      case 'movie':
        openMovieDetail(page.movie, undefined, from);
        return;
      case 'add':
        openAddMovieDetail(page.movie);
        return;
      case 'series':
        openSeriesDetail(page.series, undefined, from);
        return;
      case 'add-series':
        openAddSeriesDetail(page.series);
        return;
    }
  }, [
    activeTab,
    isDetailOpen,
    resolveForward,
    openMovieDetail,
    openAddMovieDetail,
    openSeriesDetail,
    openAddSeriesDetail,
  ]);

  const canGoForward = useCallback(() => resolveForward() !== null, [resolveForward]);

  const showForwardPreview = useCallback(
    (isShown: boolean) => setPreviewPage(isShown ? (resolveForward()?.page ?? null) : null),
    [resolveForward]
  );

  const appRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  useBackForward({
    onBack: source => {
      goBack();
      // Trackpad swipe: the page already slid out under the fingers, no fade-out left
      if (source === 'swipe') setClosingPage(null);
    },
    // Trackpad swipe: the page is already fully in place, the swipe styles are dropped in
    // the same frame without any transition
    onForward: goForward,
    onForwardPreview: showForwardPreview,
    canGoBack: isDetailOpen,
    canGoForward,
    feedbackRef: appRef,
    stageRef: contentRef,
  });

  // Opening: top of the page, focus on its title so it is announced. Closing: focus back
  // on what opened it (poster, download row), without scrolling the page, which kept its
  // position; else on that movie or series elsewhere on the page, else on the page heading.
  useLayoutEffect(() => {
    if (openPageKey !== null) {
      if (detailPaneRef.current) detailPaneRef.current.scrollTop = 0;
      document.getElementById(MEDIA_DETAIL_HEADING_ID)?.focus({ preventScroll: true });
      return;
    }
    const focusReturn = focusReturnRef.current;
    focusReturnRef.current = null;
    const list = listPaneRef.current;
    if (focusReturn === null || !list) return;
    const trigger = detailTriggerRef.current;
    let target: HTMLElement | null = null;
    if (trigger && list.contains(trigger) && isRendered(trigger)) target = trigger;
    else if (focusReturn.selector !== null) {
      const candidates = list.querySelectorAll<HTMLElement>(focusReturn.selector);
      target = Array.from(candidates).find(isRendered) ?? null;
    }
    target ??= document.getElementById(PAGE_HEADING_ID);
    target?.focus({ preventScroll: true });
  }, [openPageKey]);

  // Escape goes back to the list, unless a confirmation is open or the key belongs to a field.
  // Capture phase: runs before the dialogs' own Escape handlers can remove them.
  useEffect(() => {
    if (!isDetailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]') || isEditableTarget(event.target)) return;
      event.preventDefault();
      goBack();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isDetailOpen, goBack]);

  // Library groups stay listed in the sidebar on every screen; only the movies library
  // (no search in progress, no detail page) shows the sections they point to.
  const movieGroups = moviesManager.movieGroups;
  const isMovieLibraryShown =
    activeTab === 'movies' && searchManager.searchQuery.trim().length === 0 && !isDetailOpen;
  const movieSectionIds = useMemo(
    () => movieGroups.map(group => movieGroupSectionId(group.key)),
    [movieGroups]
  );
  const activeSectionId = useScrollSpy(
    listPaneRef,
    movieSectionIds,
    isMovieLibraryShown && movieSectionIds.length > 0
  );
  const activeMovieGroup = isMovieLibraryShown
    ? (movieGroups.find(group => movieGroupSectionId(group.key) === activeSectionId)?.key ?? null)
    : null;

  // Same for the series library
  const seriesGroups = useMemo(
    () => buildSeriesGroups(seriesManager.localSeries, seriesManager.serverSeries, seriesManager.unavailableSeries),
    [seriesManager.localSeries, seriesManager.serverSeries, seriesManager.unavailableSeries]
  );
  const isSeriesLibraryShown =
    activeTab === 'series' && searchManager.seriesSearchQuery.trim().length === 0 && !isDetailOpen;
  const seriesSectionIds = useMemo(
    () => seriesGroups.map(group => seriesGroupSectionId(group.key)),
    [seriesGroups]
  );
  const activeSeriesSectionId = useScrollSpy(
    listPaneRef,
    seriesSectionIds,
    isSeriesLibraryShown && seriesSectionIds.length > 0
  );
  const activeSeriesGroup = isSeriesLibraryShown
    ? (seriesGroups.find(group => seriesGroupSectionId(group.key) === activeSeriesSectionId)?.key ?? null)
    : null;

  const scrollToSection = useCallback((sectionId: string, headingId: string, smooth: boolean) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
    // Keyboard users continue from the section they jumped to
    document.getElementById(headingId)?.focus({ preventScroll: true });
  }, []);

  // Group picked from another screen or over search results: open the library first,
  // then scroll once its section is in the DOM (checked after each render, before paint).
  const [pendingMovieGroup, setPendingMovieGroup] = useState<MovieGroupKey | null>(null);
  const [pendingSeriesGroup, setPendingSeriesGroup] = useState<SeriesGroupKey | null>(null);

  // Any tab, "Films" included, closes the detail page
  const selectTab = useCallback(
    (tab: TabType) => {
      setPendingMovieGroup(null);
      setPendingSeriesGroup(null);
      closeDetail(false);
      setActiveTab(tab);
    },
    [closeDetail]
  );

  const { searchQuery, clearSearch, handleSearch } = searchManager;

  // Added from its page: the movie joins the library and its page takes over, unless
  // another page was opened (or this one left) while the addition was running
  const handleAddMovie = async (autoDownload: boolean) => {
    const pageChange = pageChangeRef.current;
    const created = await moviesManager.handleAddMovie(autoDownload);
    if (!created || pageChangeRef.current !== pageChange) return;
    clearSearch();
    openMovieDetail(created);
    setJustAddedMovieId(created.id);
  };

  // Same for a series: it joins the library and its page takes over
  const handleAddSeries = async () => {
    const pageChange = pageChangeRef.current;
    const created = await seriesManager.handleAddSeries();
    if (!created || pageChangeRef.current !== pageChange) return;
    searchManager.clearSeriesSearch();
    openSeriesDetail(created);
  };
  const handleSelectMovieGroup = useCallback(
    (key: MovieGroupKey) => {
      forwardPageRef.current = null;
      setPendingSeriesGroup(null);
      if (isMovieLibraryShown) {
        scrollToSection(movieGroupSectionId(key), movieGroupHeadingId(key), true);
        return;
      }
      if (searchQuery) clearSearch();
      closeDetail(false);
      setActiveTab('movies');
      setPendingMovieGroup(key);
    },
    [isMovieLibraryShown, scrollToSection, searchQuery, clearSearch, closeDetail]
  );

  const { seriesSearchQuery, clearSeriesSearch } = searchManager;
  const handleSelectSeriesGroup = useCallback(
    (key: SeriesGroupKey) => {
      forwardPageRef.current = null;
      setPendingMovieGroup(null);
      if (isSeriesLibraryShown) {
        scrollToSection(seriesGroupSectionId(key), seriesGroupHeadingId(key), true);
        return;
      }
      if (seriesSearchQuery) clearSeriesSearch();
      closeDetail(false);
      setActiveTab('series');
      setPendingSeriesGroup(key);
    },
    [isSeriesLibraryShown, scrollToSection, seriesSearchQuery, clearSeriesSearch, closeDetail]
  );

  useLayoutEffect(() => {
    if (pendingMovieGroup === null || !isMovieLibraryShown) return;
    if (!movieGroups.some(group => group.key === pendingMovieGroup)) {
      setPendingMovieGroup(null);
      return;
    }
    if (!document.getElementById(movieGroupSectionId(pendingMovieGroup))) return;
    setPendingMovieGroup(null);
    // New screen: land on the section directly instead of scrolling through it
    scrollToSection(movieGroupSectionId(pendingMovieGroup), movieGroupHeadingId(pendingMovieGroup), false);
  }, [pendingMovieGroup, isMovieLibraryShown, movieGroups, scrollToSection]);

  useLayoutEffect(() => {
    if (pendingSeriesGroup === null || !isSeriesLibraryShown) return;
    if (!seriesGroups.some(group => group.key === pendingSeriesGroup)) {
      setPendingSeriesGroup(null);
      return;
    }
    if (!document.getElementById(seriesGroupSectionId(pendingSeriesGroup))) return;
    setPendingSeriesGroup(null);
    scrollToSection(seriesGroupSectionId(pendingSeriesGroup), seriesGroupHeadingId(pendingSeriesGroup), false);
  }, [pendingSeriesGroup, isSeriesLibraryShown, seriesGroups, scrollToSection]);

  let pageSearch: PageToolbarSearch | undefined;
  if (activeTab === 'movies') {
    // Searching from a detail page goes back to the results
    pageSearch = {
      query: searchQuery,
      label: 'Rechercher un film',
      placeholder: 'Rechercher un film…',
      onChange: term => {
        closeDetail(false);
        handleSearch(term);
      },
      onClear: () => {
        closeDetail(false);
        clearSearch();
      },
    };
  } else if (activeTab === 'series') {
    pageSearch = {
      query: searchManager.seriesSearchQuery,
      label: 'Rechercher une série',
      placeholder: 'Rechercher une série…',
      onChange: term => {
        closeDetail(false);
        searchManager.handleSeriesSearch(term);
      },
      onClear: () => {
        closeDetail(false);
        searchManager.clearSeriesSearch();
      },
    };
  }

  // Shown at the top of whichever page is visible, the detail page included (Radarr's
  // for a movie page, Sonarr's for a series page, whichever page it was opened from)
  const statusBanners = (
    <>
      {(activeTab === 'movies' || (isDetailOpen && !isSeriesDetail)) && moviesManager.loadError && (
        <StatusBanner
          title="Radarr injoignable"
          detail={moviesManager.loadError}
          onRetry={() => void moviesManager.loadMovies()}
        />
      )}
      {(activeTab === 'series' || isSeriesDetail) && seriesManager.loadError && (
        <StatusBanner
          title="Sonarr injoignable"
          detail={seriesManager.loadError}
          onRetry={() => void seriesManager.loadSeries()}
        />
      )}
      {configManager.keychainWarning && (
        <StatusBanner
          title="Trousseau indisponible"
          detail={configManager.keychainWarning}
          onDismiss={configManager.dismissKeychainWarning}
        />
      )}
      {(moviesManager.actionError || seriesManager.actionError) && (
        <StatusBanner
          title="L'action a échoué"
          detail={moviesManager.actionError || seriesManager.actionError}
          onDismiss={() => {
            moviesManager.clearActionError();
            seriesManager.clearActionError();
          }}
        />
      )}
    </>
  );

  // Kept on every page a detail page can open over, so the button can fade in and out;
  // it names the current page, which is the one the detail page goes back to
  const backLabel = DETAIL_BACK_LABELS[activeTab];

  // The detail page content. `preview`: dragged in by a swipe forward, not open yet (the
  // same page as the one that opens, without the live add state).
  const renderDetailPage = (page: DetailPage, preview: boolean) => {
    const notices = isDetailOpen || preview ? statusBanners : undefined;
    switch (page.kind) {
      case 'add':
        return (
          <AddMovieView
            key={detailPageKey(page)}
            movie={page.movie}
            qualityProfiles={moviesManager.qualityProfiles}
            selectedQuality={moviesManager.selectedQuality}
            setSelectedQuality={moviesManager.setSelectedQuality}
            isAdding={isDetailOpen && moviesManager.isAddingMovie}
            error={isDetailOpen ? moviesManager.addMovieError : null}
            notices={notices}
            onAdd={handleAddMovie}
          />
        );
      case 'add-series':
        return (
          <AddSeriesView
            key={detailPageKey(page)}
            series={page.series}
            qualityProfiles={seriesManager.qualityProfiles}
            selectedQuality={seriesManager.selectedQuality}
            setSelectedQuality={seriesManager.setSelectedQuality}
            isAdding={isDetailOpen && seriesManager.isAddingSeries}
            error={isDetailOpen ? seriesManager.addSeriesError : null}
            notices={notices}
            onAdd={handleAddSeries}
          />
        );
      case 'movie': {
        const { movie } = page;
        return (
          <MovieDetailView
            key={detailPageKey(page)}
            movie={movie}
            isJustAdded={!preview &&movie.id === justAddedMovieId}
            download={downloadsManager.downloads[`movie-${movie.id}`]}
            queueItem={moviesManager.radarrQueue[movie.id]}
            movieStatus={moviesManager.getMovieStatus(movie)}
            config={configManager.config}
            notices={notices}
            // After a deletion: back to the list, nothing to reopen
            onBack={() => closeDetail(true)}
            onDownload={m => downloadsManager.handleDownloadMovie(m, configManager.config)}
            onCancelDownload={downloadsManager.handleCancelDownload}
            onPlay={playVideo}
            onDeleteDownload={downloadsManager.handleDeleteDownload}
            onDeleteServerMovie={moviesManager.handleDeleteServerMovie}
            onCancelServerQueue={moviesManager.handleCancelQueueItem}
            qualityProfiles={moviesManager.qualityProfiles}
            onChangeQuality={moviesManager.handleChangeMovieQuality}
          />
        );
      }
      case 'series': {
        const { series } = page;
        return (
          <SeriesDetailView
            key={detailPageKey(page)}
            series={series}
            episodes={seriesManager.episodesCache[series.id] ?? []}
            isLoadingEpisodes={seriesManager.isLoadingEpisodes}
            downloads={downloadsManager.downloads}
            sonarrQueue={seriesManager.sonarrQueue}
            config={configManager.config}
            notices={notices}
            // After a deletion: back to the list, nothing to reopen
            onBack={() => closeDetail(true)}
            onPlay={playVideo}
            onDownloadEpisode={(s, ep) =>
              downloadsManager.handleDownloadEpisode(s, ep, configManager.config)
            }
            onCancelDownload={downloadsManager.handleCancelDownload}
            onDeleteDownload={downloadsManager.handleDeleteDownload}
            onDeleteSeries={seriesManager.handleDeleteSeries}
            onDeleteEpisodeFile={seriesManager.handleDeleteEpisodeFile}
            onCancelServerQueue={handleCancelServerQueueItem}
            onSearchEpisode={seriesManager.handleSearchEpisode}
            onSearchSeason={seriesManager.handleSearchSeason}
          />
        );
      }
    }
  };

  const appClassName = `melia-app${sidebar.isCollapsed ? ' is-sidebar-collapsed' : ''}`;

  return (
    <div className={appClassName} ref={appRef}>
      {/* Top row: window controls, logo and toggle, the back button on a detail page, the
          page tabs while the sidebar is hidden, and the search. Its empty space moves the
          window. */}
      <PageToolbar
        leading={
          <WindowBar
            isSidebarCollapsed={sidebar.isCollapsed}
            sidebarId={SIDEBAR_ID}
            onToggleSidebar={sidebar.toggle}
          />
        }
        back={
          backLabel
            ? {
                isShown: isDetailOpen,
                label:
                  openPage?.kind === 'add' || openPage?.kind === 'add-series'
                    ? 'Retour aux résultats'
                    : backLabel,
                text: PAGE_TITLES[activeTab],
                onBack: goBack,
              }
            : undefined
        }
        tabs={
          <TopTabs
            isShown={sidebar.isCollapsed}
            activeTab={activeTab}
            onSelectTab={selectTab}
            activeDownloadCount={totalActiveDownloads}
            sidebarId={SIDEBAR_ID}
          />
        }
        areTabsShown={sidebar.isCollapsed}
        search={pageSearch}
      />

      <Sidebar
        id={SIDEBAR_ID}
        isCollapsed={sidebar.isCollapsed}
        activeTab={activeTab}
        onSelectTab={selectTab}
        activeDownloadCount={totalActiveDownloads}
        movieGroups={movieGroups}
        activeMovieGroup={activeMovieGroup}
        onSelectMovieGroup={handleSelectMovieGroup}
        seriesGroups={seriesGroups}
        activeSeriesGroup={activeSeriesGroup}
        onSelectSeriesGroup={handleSelectSeriesGroup}
      />

      {/* Two pages stacked in the content area: the tab views, and the detail page (movie
          or series) that slides in over them. Only the visible one scrolls and takes the
          focus. */}
      <main
        className="melia-content t-page-slide"
        data-page={isDetailOpen ? '2' : '1'}
        ref={contentRef}
      >
        <div className="melia-page t-page" data-page-id="1" ref={listPaneRef} inert={isDetailOpen}>
          {/* Page name for screen readers only: on screen, the sidebar or the tabs show it */}
          <h2 className="sr-only" id={PAGE_HEADING_ID} tabIndex={-1}>
            {PAGE_TITLES[activeTab]}
          </h2>
          {!isDetailOpen && statusBanners}

          <div style={{ display: activeTab === 'movies' ? 'block' : 'none' }}>
            <MoviesView
              searchQuery={searchManager.searchQuery}
              searchResults={searchManager.searchResults}
              isSearching={searchManager.isSearching}
              movies={moviesManager.movies}
              movieGroups={moviesManager.movieGroups}
              downloads={downloadsManager.downloads}
              radarrQueue={moviesManager.radarrQueue}
              findInLibrary={moviesManager.findInLibrary}
              onSelectMovie={openMovieDetail}
              onOpenAddMovie={openAddMovieDetail}
              isConfigLoaded={configManager.configLoaded}
              isConfigured={moviesManager.isConfigured}
              hasLoaded={moviesManager.hasLoaded}
              hasLoadError={Boolean(moviesManager.loadError)}
              onOpenSettings={() => selectTab('settings')}
            />
          </div>

          <div style={{ display: activeTab === 'series' ? 'block' : 'none' }}>
            <SeriesView
              searchQuery={searchManager.seriesSearchQuery}
              searchResults={searchManager.seriesSearchResults}
              isSearching={searchManager.isSeriesSearching}
              series={seriesManager.series}
              seriesGroups={seriesGroups}
              downloads={downloadsManager.downloads}
              sonarrQueue={seriesManager.sonarrQueue}
              findInLibrary={seriesManager.findInLibrary}
              onSelectSeries={openSeriesDetail}
              onPrepareSeries={seriesManager.prefetchSeriesEpisodes}
              onOpenAddSeries={openAddSeriesDetail}
              isConfigLoaded={configManager.configLoaded}
              isConfigured={seriesManager.isConfigured}
              hasLoaded={seriesManager.hasLoaded}
              hasLoadError={Boolean(seriesManager.loadError)}
              onOpenSettings={() => selectTab('settings')}
            />
          </div>

          <div style={{ display: activeTab === 'downloads' ? 'block' : 'none' }}>
            <DownloadsView
              downloads={downloadsManager.downloads}
              serverQueueList={unifiedServerQueue}
              movies={moviesManager.movies}
              series={seriesManager.series}
              onPause={downloadsManager.handleCancelDownload}
              onResume={handleResumeDownload}
              onPlay={playVideo}
              onDelete={downloadsManager.handleDeleteDownload}
              onCancelServerQueue={handleCancelServerQueueItem}
              onSelectMovie={openMovieDetailFromDownloads}
              onSelectSeries={openSeriesDetailFromDownloads}
            />
          </div>

          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <SettingsView
              downloadDir={downloadsManager.downloadDir}
              appInfo={updater.appInfo}
              onSelectFolder={downloadsManager.handleSelectFolder}
              onOpenFolder={() =>
                downloadsManager.handleOpenFolder(updater.appInfo?.default_download_dir)
              }
              onResetFolder={() => {
                if (updater.appInfo?.default_download_dir) {
                  downloadsManager.handleResetFolder(updater.appInfo.default_download_dir);
                }
              }}
              updateVersion={updater.updateVersion}
              checkingUpdate={updater.checkingUpdate}
              isInstalling={updater.isInstalling}
              updateStatusText={updater.updateStatusText}
              onManualCheckUpdate={updater.handleManualCheck}
              onInstallUpdate={updater.handleInstall}
              config={configManager.config}
              editingConfig={configManager.editingConfig}
              setEditingConfig={configManager.setEditingConfig}
              isEditingConfig={configManager.isEditingConfig}
              configSaved={configManager.configSaved}
              onStartEditing={configManager.startEditing}
              onCancelEditing={configManager.cancelEditing}
              onSaveConfig={() => {
                configManager.saveConfig();
                void moviesManager.loadMovies(configManager.editingConfig);
                void seriesManager.loadSeries(configManager.editingConfig);
              }}
              radarrError={moviesManager.loadError}
              sonarrError={seriesManager.loadError}
              onShowChangelog={changelogManager.openChangelog}
            />
          </div>
        </div>

        <div
          className="melia-page t-page"
          data-page-id="2"
          ref={detailPaneRef}
          inert={!isDetailOpen}
          aria-hidden={isPreview || undefined}
          onTransitionEnd={event => {
            if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
            if (!isDetailOpen) setClosingPage(null);
          }}
        >
          {detailPage && renderDetailPage(detailPage, isPreview)}
        </div>
      </main>

      <UpdateBanner
        updateVersion={updater.updateVersion}
        isInstalling={updater.isInstalling}
        onInstall={updater.handleInstall}
        onDismiss={updater.dismissUpdate}
      />

      <ConfigImportModal
        isOpen={configManager.showConfigPrompt}
        password={configManager.configPassword}
        onPasswordChange={configManager.setConfigPassword}
        error={configManager.configError}
        onDecrypt={async () => {
          await configManager.handleDecrypt();
        }}
        onClose={configManager.handleCancelPrompt}
      />

      <ChangelogModal
        isOpen={changelogManager.isOpen}
        version={changelogManager.version}
        groups={changelogManager.groups}
        date={changelogManager.date}
        onClose={changelogManager.closeChangelog}
      />
    </div>
  );
}

export default App;

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { DownloadInfo, Episode, Movie, Series, TabType, UnifiedQueueItem } from './types';
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

import { StatusBanner } from './components/common/StatusBanner';
import { Sidebar } from './components/layout/Sidebar';
import { PageToolbar, type PageToolbarSearch } from './components/layout/PageToolbar';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { WindowBar } from './components/layout/WindowBar';
import { MoviesView } from './components/movies/MoviesView';
import { MOVIE_DETAIL_HEADING_ID, MovieDetailView } from './components/movies/MovieDetailView';
import { AddMovieModal } from './components/movies/AddMovieModal';
import { SeriesView } from './components/series/SeriesView';
import { SeriesDetailModal } from './components/series/SeriesDetailModal';
import { AddSeriesModal } from './components/series/AddSeriesModal';
import { DownloadsView } from './components/downloads/DownloadsView';
import { SettingsView } from './components/settings/SettingsView';
import { ConfigImportModal } from './components/settings/ConfigImportModal';
import { ChangelogModal } from './components/changelog/ChangelogModal';

import './App.css';

const SIDEBAR_ID = 'app-sidebar';

const PAGE_TITLES: Record<TabType, string> = {
  movies: 'Films',
  series: 'Séries',
  downloads: 'Téléchargements',
  settings: 'Paramètres',
};
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

  // Movie detail page: shown in the content area in place of the list, which stays
  // mounted (and scrolled where it was) underneath.
  const { selectedMovie, setSelectedMovie, selectMovie } = moviesManager;
  // Library refreshes (queue end, focus, every 5 min) reach the open page
  const liveMovie = selectedMovie
    ? (moviesManager.movies.find(m => m.id === selectedMovie.id) ?? selectedMovie)
    : null;
  const isMovieDetailOpen = activeTab === 'movies' && liveMovie !== null;
  // Kept after closing so the page can slide out, then dropped (see onTransitionEnd)
  const [closingMovie, setClosingMovie] = useState<Movie | null>(null);
  if (isMovieDetailOpen && liveMovie !== closingMovie) setClosingMovie(liveMovie);
  const detailMovie = isMovieDetailOpen ? liveMovie : closingMovie;
  const openMovieId = isMovieDetailOpen ? liveMovie.id : null;

  const listPaneRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<HTMLDivElement>(null);
  // Poster that opened the page, and the movie whose poster takes the focus back on return
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const focusReturnMovieIdRef = useRef<number | null>(null);

  // Page left with "back", reopened by "forward" (mouse button, swipe), like a browser.
  // Only the detail page is in this history, not the tabs: any other way of leaving it
  // (tab, sidebar group, search, another movie, deletion) forgets it.
  const forwardMovieRef = useRef<Movie | null>(null);

  const openMovieDetail = useCallback(
    (movie: Movie, trigger?: HTMLElement) => {
      forwardMovieRef.current = null;
      detailTriggerRef.current = trigger ?? null;
      setActiveTab('movies');
      void selectMovie(movie);
    },
    [selectMovie]
  );

  /** `restoreFocus`: going back. A tab, a group or the search keep their own focus. */
  const closeMovieDetail = useCallback(
    (restoreFocus: boolean) => {
      forwardMovieRef.current = null;
      focusReturnMovieIdRef.current = restoreFocus && selectedMovie ? selectedMovie.id : null;
      setSelectedMovie(null);
    },
    [selectedMovie, setSelectedMovie]
  );

  // One path for every "back": header button, Escape, mouse button, trackpad swipe
  const goBack = useCallback(() => {
    if (!isMovieDetailOpen) return;
    closeMovieDetail(true);
    forwardMovieRef.current = liveMovie;
  }, [isMovieDetailOpen, closeMovieDetail, liveMovie]);

  const movies = moviesManager.movies;
  const goForward = useCallback(() => {
    const movie = forwardMovieRef.current;
    if (!movie || activeTab !== 'movies' || isMovieDetailOpen) return;
    // Removed from the library in the meantime: nothing to reopen
    const current = movies.find(m => m.id === movie.id);
    if (current) openMovieDetail(current);
    else forwardMovieRef.current = null;
  }, [activeTab, isMovieDetailOpen, movies, openMovieDetail]);

  const appRef = useRef<HTMLDivElement>(null);
  useBackForward({
    onBack: goBack,
    onForward: goForward,
    canGoBack: isMovieDetailOpen,
    feedbackRef: appRef,
  });

  // Opening: top of the page, focus on its title so it is announced. Closing: focus back
  // on the poster, without scrolling the list, which kept its position.
  useLayoutEffect(() => {
    if (openMovieId !== null) {
      if (detailPaneRef.current) detailPaneRef.current.scrollTop = 0;
      document.getElementById(MOVIE_DETAIL_HEADING_ID)?.focus({ preventScroll: true });
      return;
    }
    const movieId = focusReturnMovieIdRef.current;
    focusReturnMovieIdRef.current = null;
    const list = listPaneRef.current;
    if (movieId === null || !list) return;
    const trigger = detailTriggerRef.current;
    const target =
      trigger && list.contains(trigger)
        ? trigger
        : list.querySelector<HTMLElement>(`[data-movie-id="${movieId}"]`);
    target?.focus({ preventScroll: true });
  }, [openMovieId]);

  // Escape goes back to the list, unless a confirmation is open or the key belongs to a field.
  // Capture phase: runs before the dialogs' own Escape handlers can remove them.
  useEffect(() => {
    if (!isMovieDetailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]') || isEditableTarget(event.target)) return;
      event.preventDefault();
      goBack();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isMovieDetailOpen, goBack]);

  // Library groups stay listed in the sidebar on every screen; only the movies library
  // (no search in progress, no detail page) shows the sections they point to.
  const movieGroups = moviesManager.movieGroups;
  const isMovieLibraryShown =
    activeTab === 'movies' && searchManager.searchQuery.trim().length === 0 && !isMovieDetailOpen;
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

  const scrollToMovieGroup = useCallback((key: MovieGroupKey, smooth: boolean) => {
    const section = document.getElementById(movieGroupSectionId(key));
    if (!section) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
    // Keyboard users continue from the section they jumped to
    document.getElementById(movieGroupHeadingId(key))?.focus({ preventScroll: true });
  }, []);

  // Group picked from another screen or over search results: open the library first,
  // then scroll once its section is in the DOM (checked after each render, before paint).
  const [pendingMovieGroup, setPendingMovieGroup] = useState<MovieGroupKey | null>(null);

  // Any tab, "Films" included, closes the detail page
  const selectTab = useCallback(
    (tab: TabType) => {
      forwardMovieRef.current = null;
      setPendingMovieGroup(null);
      setSelectedMovie(null);
      setActiveTab(tab);
    },
    [setSelectedMovie]
  );

  const { searchQuery, clearSearch, handleSearch } = searchManager;
  const handleSelectMovieGroup = useCallback(
    (key: MovieGroupKey) => {
      forwardMovieRef.current = null;
      if (isMovieLibraryShown) {
        scrollToMovieGroup(key, true);
        return;
      }
      if (searchQuery) clearSearch();
      setSelectedMovie(null);
      setActiveTab('movies');
      setPendingMovieGroup(key);
    },
    [isMovieLibraryShown, scrollToMovieGroup, searchQuery, clearSearch, setSelectedMovie]
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
    scrollToMovieGroup(pendingMovieGroup, false);
  }, [pendingMovieGroup, isMovieLibraryShown, movieGroups, scrollToMovieGroup]);

  let pageSearch: PageToolbarSearch | undefined;
  if (activeTab === 'movies') {
    // Searching from a detail page goes back to the results
    pageSearch = {
      query: searchQuery,
      label: 'Rechercher un film',
      placeholder: 'Rechercher un film…',
      onChange: term => {
        closeMovieDetail(false);
        handleSearch(term);
      },
      onClear: () => {
        closeMovieDetail(false);
        clearSearch();
      },
    };
  } else if (activeTab === 'series') {
    pageSearch = {
      query: searchManager.seriesSearchQuery,
      label: 'Rechercher une série',
      placeholder: 'Rechercher une série…',
      onChange: searchManager.handleSeriesSearch,
      onClear: searchManager.clearSeriesSearch,
    };
  }

  // Shown at the top of whichever page is visible, the movie detail page included
  const statusBanners = (
    <>
      {activeTab === 'movies' && moviesManager.loadError && (
        <StatusBanner
          title="Radarr injoignable"
          detail={moviesManager.loadError}
          onRetry={() => void moviesManager.loadMovies()}
        />
      )}
      {activeTab === 'series' && seriesManager.loadError && (
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

  const appClassName = `melia-app${sidebar.isCollapsed ? ' is-sidebar-collapsed' : ''}`;

  return (
    <div className={appClassName} ref={appRef}>
      {/* Top row: window controls, logo and toggle, then the page title (or, on the movie
          detail page, the back button in its place) and search. Its empty space moves the window. */}
      <PageToolbar
        leading={
          <WindowBar
            isSidebarCollapsed={sidebar.isCollapsed}
            sidebarId={SIDEBAR_ID}
            onToggleSidebar={sidebar.toggle}
          />
        }
        title={PAGE_TITLES[activeTab]}
        back={
          activeTab === 'movies'
            ? {
                isShown: isMovieDetailOpen,
                label: 'Retour aux films',
                onBack: goBack,
              }
            : undefined
        }
        search={pageSearch}
        measure={activeTab === 'downloads' || activeTab === 'settings' ? 'narrow' : 'wide'}
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
      />

      {/* Two pages stacked in the content area: the tab views, and the movie detail page
          that slides in over them. Only the visible one scrolls and takes the focus. */}
      <main
        className="melia-content t-page-slide"
        data-page={isMovieDetailOpen ? '2' : '1'}
        data-sidebar-follow=""
      >
        <div className="melia-page t-page" data-page-id="1" ref={listPaneRef} inert={isMovieDetailOpen}>
          {!isMovieDetailOpen && statusBanners}

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
              onOpenAddMovie={moviesManager.openAddMovie}
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
              localSeries={seriesManager.localSeries}
              serverSeries={seriesManager.serverSeries}
              unavailableSeries={seriesManager.unavailableSeries}
              downloads={downloadsManager.downloads}
              sonarrQueue={seriesManager.sonarrQueue}
              findInLibrary={seriesManager.findInLibrary}
              onSelectSeries={seriesManager.selectSeries}
              onOpenAddSeries={seriesManager.openAddSeries}
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
              onSelectMovie={openMovieDetail}
              onSelectSeries={seriesManager.selectSeries}
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
            />
          </div>
        </div>

        <div
          className="melia-page t-page"
          data-page-id="2"
          ref={detailPaneRef}
          inert={!isMovieDetailOpen}
          onTransitionEnd={event => {
            if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
            if (!isMovieDetailOpen) setClosingMovie(null);
          }}
        >
          {detailMovie && (
            <MovieDetailView
              key={detailMovie.id}
              movie={detailMovie}
              download={downloadsManager.downloads[`movie-${detailMovie.id}`]}
              queueItem={moviesManager.radarrQueue[detailMovie.id]}
              movieStatus={moviesManager.getMovieStatus(detailMovie)}
              config={configManager.config}
              notices={isMovieDetailOpen ? statusBanners : undefined}
              // After a deletion: back to the list, nothing to reopen
              onBack={() => closeMovieDetail(true)}
              onDownload={m => downloadsManager.handleDownloadMovie(m, configManager.config)}
              onCancelDownload={downloadsManager.handleCancelDownload}
              onPlay={playVideo}
              onDeleteDownload={downloadsManager.handleDeleteDownload}
              onDeleteServerMovie={moviesManager.handleDeleteServerMovie}
              onCancelServerQueue={moviesManager.handleCancelQueueItem}
              qualityProfiles={moviesManager.qualityProfiles}
              onChangeQuality={moviesManager.handleChangeMovieQuality}
            />
          )}
        </div>
      </main>

      <UpdateBanner
        updateVersion={updater.updateVersion}
        isInstalling={updater.isInstalling}
        onInstall={updater.handleInstall}
        onDismiss={updater.dismissUpdate}
      />

      {/* Movies Modals */}
      <AddMovieModal
        movie={moviesManager.addingMovie}
        qualityProfiles={moviesManager.qualityProfiles}
        selectedQuality={moviesManager.selectedQuality}
        setSelectedQuality={moviesManager.setSelectedQuality}
        isAdding={moviesManager.isAddingMovie}
        error={moviesManager.addMovieError}
        onAdd={async (autoDownload: boolean) => {
          const success = await moviesManager.handleAddMovie(autoDownload);
          if (success) {
            searchManager.clearSearch();
          }
        }}
        onClose={moviesManager.closeAddMovie}
      />

      {/* Series Modals */}
      <SeriesDetailModal
        series={seriesManager.selectedSeries}
        episodes={seriesManager.selectedSeriesEpisodes}
        isLoadingEpisodes={seriesManager.isLoadingEpisodes}
        downloads={downloadsManager.downloads}
        sonarrQueue={seriesManager.sonarrQueue}
        config={configManager.config}
        onClose={() => seriesManager.selectSeries(null)}
        onPlayStream={playVideo}
        onPlayLocal={playVideo}
        onDownloadEpisode={(s, ep) =>
          downloadsManager.handleDownloadEpisode(s, ep, configManager.config)
        }
        onCancelDownload={downloadsManager.handleCancelDownload}
        onDeleteDownload={downloadsManager.handleDeleteDownload}
        onDeleteSeries={seriesManager.handleDeleteSeries}
        onDeleteEpisodeFile={seriesManager.handleDeleteEpisodeFile}
        onCancelServerQueue={handleCancelServerQueueItem}
        onRefreshEpisodes={seriesManager.refreshCurrentEpisodes}
        onSearchEpisode={seriesManager.handleSearchEpisode}
        onSearchSeason={seriesManager.handleSearchSeason}
      />

      <AddSeriesModal
        series={seriesManager.addingSeries}
        qualityProfiles={seriesManager.qualityProfiles}
        selectedQuality={seriesManager.selectedQuality}
        setSelectedQuality={seriesManager.setSelectedQuality}
        isAdding={seriesManager.isAddingSeries}
        error={seriesManager.addSeriesError}
        onAdd={async () => {
          const success = await seriesManager.handleAddSeries();
          if (success) {
            searchManager.clearSeriesSearch();
          }
        }}
        onClose={seriesManager.closeAddSeries}
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
        onClose={changelogManager.closeChangelog}
      />
    </div>
  );
}

export default App;

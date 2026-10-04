import { useState, useEffect, useCallback, useMemo } from 'react';
import { DownloadInfo, Episode, Movie, Series, TabType, UnifiedQueueItem } from './types';
import { useConfig } from './hooks/useConfig';
import { useDownloads } from './hooks/useDownloads';
import { useMovies } from './hooks/useMovies';
import { useSeries } from './hooks/useSeries';
import { useSearch } from './hooks/useSearch';
import { useUpdater } from './hooks/useUpdater';
import { useChangelog } from './hooks/useChangelog';
import { playVideo } from './services/player';

import { Header } from './components/layout/Header';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { MoviesView } from './components/movies/MoviesView';
import { MovieDetailModal } from './components/movies/MovieDetailModal';
import { AddMovieModal } from './components/movies/AddMovieModal';
import { SeriesView } from './components/series/SeriesView';
import { SeriesDetailModal } from './components/series/SeriesDetailModal';
import { AddSeriesModal } from './components/series/AddSeriesModal';
import { DownloadsView } from './components/downloads/DownloadsView';
import { SettingsView } from './components/settings/SettingsView';
import { ConfigImportModal } from './components/settings/ConfigImportModal';
import { ChangelogModal } from './components/changelog/ChangelogModal';

import './App.css';

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
    (movie: Movie) => {
      void downloadsManager.handleDownloadMovie(movie, configManager.config);
    },
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
    const movieItems: UnifiedQueueItem[] = Object.values(moviesManager.radarrQueue).map(q => ({
      id: `radarr-${q.id || q.movieId}`,
      mediaType: 'movie',
      mediaId: q.movieId,
      title: q.movie ? `${q.movie.title} (${q.movie.year})` : q.title || 'Film',
      size: q.size,
      sizeleft: q.sizeleft,
      timeleft: q.timeleft,
      status: q.status,
      trackedDownloadStatus: q.trackedDownloadStatus,
      queueId: q.id,
    }));
    return [...movieItems, ...seriesManager.sonarrQueue];
  }, [moviesManager.radarrQueue, seriesManager.sonarrQueue]);

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

  return (
    <div className="melia-app">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeDownloadCount={totalActiveDownloads}
      />

      <main className="melia-content">
        <div style={{ display: activeTab === 'movies' ? 'block' : 'none' }}>
          <MoviesView
            searchQuery={searchManager.searchQuery}
            searchResults={searchManager.searchResults}
            isSearching={searchManager.isSearching}
            onSearchChange={searchManager.handleSearch}
            onClearSearch={searchManager.clearSearch}
            movies={moviesManager.movies}
            localMovies={moviesManager.localMovies}
            serverMovies={moviesManager.serverMovies}
            downloads={downloadsManager.downloads}
            radarrQueue={moviesManager.radarrQueue}
            findInLibrary={moviesManager.findInLibrary}
            onSelectMovie={moviesManager.selectMovie}
            onOpenAddMovie={moviesManager.openAddMovie}
          />
        </div>

        <div style={{ display: activeTab === 'series' ? 'block' : 'none' }}>
          <SeriesView
            searchQuery={searchManager.seriesSearchQuery}
            searchResults={searchManager.seriesSearchResults}
            isSearching={searchManager.isSeriesSearching}
            onSearchChange={searchManager.handleSeriesSearch}
            onClearSearch={searchManager.clearSeriesSearch}
            series={seriesManager.series}
            localSeries={seriesManager.localSeries}
            serverSeries={seriesManager.serverSeries}
            unavailableSeries={seriesManager.unavailableSeries}
            downloads={downloadsManager.downloads}
            sonarrQueue={seriesManager.sonarrQueue}
            findInLibrary={seriesManager.findInLibrary}
            onSelectSeries={seriesManager.selectSeries}
            onOpenAddSeries={seriesManager.openAddSeries}
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
            onSelectMovie={moviesManager.selectMovie}
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
      </main>

      <UpdateBanner
        updateVersion={updater.updateVersion}
        isInstalling={updater.isInstalling}
        onInstall={updater.handleInstall}
        onDismiss={updater.dismissUpdate}
      />

      {/* Movies Modals */}
      <MovieDetailModal
        movie={moviesManager.selectedMovie}
        download={
          moviesManager.selectedMovie
            ? downloadsManager.downloads[`movie-${moviesManager.selectedMovie.id}`]
            : undefined
        }
        queueItem={
          moviesManager.selectedMovie
            ? moviesManager.radarrQueue[moviesManager.selectedMovie.id]
            : undefined
        }
        movieStatus={
          moviesManager.selectedMovie
            ? moviesManager.getMovieStatus(moviesManager.selectedMovie)
            : 'unavailable'
        }
        config={configManager.config}
        onClose={() => moviesManager.setSelectedMovie(null)}
        onDownload={m => downloadsManager.handleDownloadMovie(m, configManager.config)}
        onCancelDownload={downloadsManager.handleCancelDownload}
        onPlayStream={playVideo}
        onPlayLocal={playVideo}
        onDeleteDownload={downloadsManager.handleDeleteDownload}
        onDeleteServerMovie={moviesManager.handleDeleteServerMovie}
        onCancelServerQueue={moviesManager.handleCancelQueueItem}
      />

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

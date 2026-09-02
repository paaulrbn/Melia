import { useState, useEffect, useCallback, useMemo } from 'react';
import { Movie, TabType } from './types';
import { useConfig } from './hooks/useConfig';
import { useDownloads } from './hooks/useDownloads';
import { useMovies } from './hooks/useMovies';
import { useSearch } from './hooks/useSearch';
import { useUpdater } from './hooks/useUpdater';
import { playVideo } from './services/player';

import { Header } from './components/layout/Header';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { MoviesView } from './components/movies/MoviesView';
import { MovieDetailModal } from './components/movies/MovieDetailModal';
import { AddMovieModal } from './components/movies/AddMovieModal';
import { DownloadsView } from './components/downloads/DownloadsView';
import { SettingsView } from './components/settings/SettingsView';
import { ConfigImportModal } from './components/settings/ConfigImportModal';

import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('movies');

  // Core Hooks
  const updater = useUpdater();
  const downloadsManager = useDownloads();
  const configManager = useConfig();

  const handleMoviesFetched = useCallback(
    (fetchedMovies: Movie[]) => {
      const activeDir =
        downloadsManager.downloadDir || updater.appInfo?.default_download_dir || '';
      if (activeDir) {
        downloadsManager.syncWithDisk(fetchedMovies, activeDir);
      }
    },
    [downloadsManager, updater.appInfo?.default_download_dir]
  );

  const handleAutoDownloadReady = useCallback(
    (movie: Movie) => {
      downloadsManager.handleDownload(movie, configManager.config);
    },
    [downloadsManager, configManager.config]
  );

  const moviesManager = useMovies({
    config: configManager.config,
    downloads: downloadsManager.downloads,
    onMoviesFetched: handleMoviesFetched,
    onAutoDownloadReady: handleAutoDownloadReady,
  });

  // Resync downloads with disk whenever download directory or library changes
  useEffect(() => {
    const activeDir =
      downloadsManager.downloadDir || updater.appInfo?.default_download_dir || '';
    if (activeDir && moviesManager.movies.length > 0) {
      downloadsManager.syncWithDisk(moviesManager.movies, activeDir);
    }
  }, [
    downloadsManager.downloadDir,
    moviesManager.movies,
    updater.appInfo?.default_download_dir,
    downloadsManager.syncWithDisk,
  ]);

  const searchManager = useSearch(configManager.config);

  const totalActiveDownloads = useMemo(() => {
    return downloadsManager.activeCount + Object.keys(moviesManager.radarrQueue).length;
  }, [downloadsManager.activeCount, moviesManager.radarrQueue]);

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

        <div style={{ display: activeTab === 'downloads' ? 'block' : 'none' }}>
          <DownloadsView
            downloads={downloadsManager.downloads}
            radarrQueue={moviesManager.radarrQueue}
            movies={moviesManager.movies}
            onPause={downloadsManager.handleCancelDownload}
            onResume={m => downloadsManager.handleDownload(m, configManager.config)}
            onPlay={playVideo}
            onDelete={downloadsManager.handleDeleteDownload}
            onSelectMovie={moviesManager.selectMovie}
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
              moviesManager.loadMovies(configManager.editingConfig);
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

      <MovieDetailModal
        movie={moviesManager.selectedMovie}
        download={
          moviesManager.selectedMovie
            ? downloadsManager.downloads[moviesManager.selectedMovie.id]
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
        onClose={() => moviesManager.setSelectedMovie(null)}
        onDownload={m => downloadsManager.handleDownload(m, configManager.config)}
        onCancelDownload={downloadsManager.handleCancelDownload}
        onPlayLocal={playVideo}
        onDeleteDownload={downloadsManager.handleDeleteDownload}
        onDeleteServerMovie={moviesManager.handleDeleteServerMovie}
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
    </div>
  );
}

export default App;

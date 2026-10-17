import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Config, DownloadInfo, LookupMovie, Movie, QualityProfile, QueueRecord } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { normalizeRootFolder } from '../utils/formatters';
import { useAdaptivePolling } from './useAdaptivePolling';
import {
  fetchRadarrMovies,
  fetchRadarrMovie,
  fetchQualityProfiles as apiFetchQualityProfiles,
  addRadarrMovie,
  triggerRadarrMovieSearch,
  updateRadarrMovieQuality,
  deleteRadarrMovie,
  deleteRadarrQueueItem,
  fetchRadarrQueue,
} from '../services/radarr';

interface UseMoviesProps {
  config: Config;
  downloads: Record<string, DownloadInfo>;
  onMoviesFetched?: (movies: Movie[]) => void;
  /** Resolves to false when the download could not start, so the movie stays queued for a retry. */
  onAutoDownloadReady?: (movie: Movie) => Promise<boolean> | void;
}

function readErrorMessage(raw: unknown): string {
  return typeof raw === 'string' ? raw : (raw as Error)?.message || 'Erreur inconnue';
}

function parseRadarrErrorMessage(raw: unknown): string {
  let errMsg = typeof raw === 'string' ? raw : (raw as Error)?.message || 'Erreur inconnue';
  const start = errMsg.indexOf('[');
  const end = errMsg.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const jsonSub = errMsg.slice(start, end + 1);
      const parsed = JSON.parse(jsonSub);
      if (Array.isArray(parsed) && parsed[0]?.errorMessage) {
        errMsg = parsed.map((p: { errorMessage?: string }) => p.errorMessage || '').filter(Boolean).join(', ');
      }
    } catch {
      // JSON slice parsing failed; keep raw message
    }
  }
  return errMsg;
}

export function useMovies({
  config,
  downloads,
  onMoviesFetched,
  onAutoDownloadReady,
}: UseMoviesProps) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Keep a ref to onMoviesFetched to avoid effect re-runs on render
  const onMoviesFetchedRef = useRef(onMoviesFetched);
  onMoviesFetchedRef.current = onMoviesFetched;

  const onAutoDownloadReadyRef = useRef(onAutoDownloadReady);
  onAutoDownloadReadyRef.current = onAutoDownloadReady;

  // Auto-download movie IDs (persisted across restarts)
  const [autoDownloadIds, setAutoDownloadIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTO_DOWNLOAD);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // Ignored: Corrupted auto-download data in storage
    }
    return new Set();
  });

  const autoDownloadIdsRef = useRef(autoDownloadIds);
  autoDownloadIdsRef.current = autoDownloadIds;

  // Track previous queue keys to auto-refresh when a download completes on server
  const prevQueueKeysRef = useRef<Set<number>>(new Set());

  // Radarr real-time queue
  const [radarrQueue, setRadarrQueue] = useState<Record<number, QueueRecord>>({});

  // Add movie state
  const [addingMovie, setAddingMovie] = useState<LookupMovie | null>(null);
  const [qualityProfiles, setQualityProfiles] = useState<QualityProfile[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);
  const [isAddingMovie, setIsAddingMovie] = useState(false);
  const [addMovieError, setAddMovieError] = useState<string | null>(null);

  const radarrUrl = config['RADARR_BASE_URL'];
  const radarrKey = config['RADARR_API_KEY'];

  const updateAutoDownloadIds = useCallback((update: (ids: Set<number>) => Set<number>) => {
    const next = update(autoDownloadIdsRef.current);
    autoDownloadIdsRef.current = next;
    setAutoDownloadIds(next);
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_DOWNLOAD, JSON.stringify(Array.from(next)));
    } catch {
      // Storage write failed; ignore
    }
  }, []);

  // Check if any movie marked for auto-download is now available with a file
  const checkAutoDownloads = useCallback((moviesList: Movie[]) => {
    if (autoDownloadIdsRef.current.size === 0) return;

    for (const movie of moviesList) {
      if (!autoDownloadIdsRef.current.has(movie.id) || !movie.hasFile || !movie.movieFile) continue;

      // The id leaves the pending list while the download runs (no double start), and comes back
      // if the download fails, so the next library refresh retries it.
      updateAutoDownloadIds(ids => {
        const next = new Set(ids);
        next.delete(movie.id);
        return next;
      });
      void Promise.resolve(onAutoDownloadReadyRef.current?.(movie))
        .then(started => {
          if (started === false) {
            updateAutoDownloadIds(ids => new Set(ids).add(movie.id));
          }
        })
        .catch(() => {
          updateAutoDownloadIds(ids => new Set(ids).add(movie.id));
        });
    }
  }, [updateAutoDownloadIds]);

  // Fetch movies from Radarr
  const loadMovies = useCallback(async (cfg?: Config) => {
    const baseUrl = cfg?.['RADARR_BASE_URL'] || radarrUrl;
    const apiKey = cfg?.['RADARR_API_KEY'] || radarrKey;
    if (!baseUrl || !apiKey) return;

    try {
      const allMovies = await fetchRadarrMovies();
      setMovies(allMovies);
      setLoadError(null);
      onMoviesFetchedRef.current?.(allMovies);
      checkAutoDownloads(allMovies);
    } catch (e: unknown) {
      setLoadError(readErrorMessage(e));
    }
  }, [radarrUrl, radarrKey, checkAutoDownloads]);

  // Load movies when Radarr config keys change
  useEffect(() => {
    if (radarrUrl && radarrKey) {
      void loadMovies();
    }
  }, [radarrUrl, radarrKey, loadMovies]);

  // Library refresh on window focus / visibility and relaxed periodic check (5 min)
  useEffect(() => {
    if (!radarrUrl || !radarrKey) return;

    const handleFocus = () => {
      void loadMovies();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadMovies();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadMovies();
      }
    }, 300000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [radarrUrl, radarrKey, loadMovies]);

  // Adaptive Radarr queue polling
  const pollQueue = useCallback(async (): Promise<boolean> => {
    if (!radarrUrl || !radarrKey) return false;

    try {
      const queueMap = await fetchRadarrQueue();
      setRadarrQueue(queueMap);
      setLoadError(null);

      const currentKeys = new Set(Object.keys(queueMap).map(Number));
      const hasActiveItems = currentKeys.size > 0;

      let completedAny = false;
      for (const prevId of prevQueueKeysRef.current) {
        if (!currentKeys.has(prevId)) {
          completedAny = true;
          break;
        }
      }
      prevQueueKeysRef.current = currentKeys;

      if (completedAny) {
        await loadMovies();
      }
      return hasActiveItems;
    } catch (e: unknown) {
      setLoadError(readErrorMessage(e));
      return false;
    }
  }, [radarrUrl, radarrKey, loadMovies]);

  useAdaptivePolling(pollQueue, !!(radarrUrl && radarrKey));

  // Select movie and immediately fetch fresh state from server
  const selectMovie = useCallback(
    async (movie: Movie) => {
      setSelectedMovie(movie);
      if (radarrUrl && radarrKey) {
        try {
          const fresh = await fetchRadarrMovie(movie.id);
          if (fresh?.id) {
            setSelectedMovie(prev => (prev?.id === movie.id ? fresh : prev));
            setMovies(prev => prev.map(m => (m.id === movie.id ? fresh : m)));
            if (fresh.hasFile && fresh.movieFile && autoDownloadIdsRef.current.has(fresh.id)) {
              checkAutoDownloads([fresh]);
            }
          }
        } catch {
          // Fetch fresh movie failed; retain cache
        }
      }
    },
    [radarrUrl, radarrKey, checkAutoDownloads]
  );

  // Quality profiles
  const loadQualityProfiles = useCallback(async () => {
    if (!radarrUrl || !radarrKey) return;

    try {
      const data = await apiFetchQualityProfiles();
      setQualityProfiles(data);
      if (data.length > 0 && !selectedQuality) {
        setSelectedQuality(data[0].id);
      }
    } catch {
      // Quality profiles fetch failed; ignore
    }
  }, [radarrUrl, radarrKey, selectedQuality]);

  // Profiles are needed in the detail modal to change the quality of a missing movie
  const hasSelectedMovie = selectedMovie !== null;
  useEffect(() => {
    if (hasSelectedMovie && qualityProfiles.length === 0) {
      void loadQualityProfiles();
    }
  }, [hasSelectedMovie, qualityProfiles.length, loadQualityProfiles]);

  const openAddMovie = (lookupMovie: LookupMovie) => {
    setAddingMovie(lookupMovie);
    setAddMovieError(null);
    setIsAddingMovie(false);
    void loadQualityProfiles();
  };

  const closeAddMovie = () => {
    setAddingMovie(null);
    setAddMovieError(null);
    setIsAddingMovie(false);
  };

  const handleAddMovie = async (autoDownload: boolean = false) => {
    if (!addingMovie || !selectedQuality || !radarrUrl || !radarrKey) return false;
    const cleanRoot = normalizeRootFolder(config['RADARR_ROOT_FOLDER'], '/movies');

    setIsAddingMovie(true);
    setAddMovieError(null);

    try {
      const createdMovie = await addRadarrMovie({
        rootFolder: cleanRoot,
        tmdbId: addingMovie.tmdbId,
        title: addingMovie.title,
        year: addingMovie.year,
        qualityProfileId: selectedQuality,
      });

      if (createdMovie?.id) {
        try {
          await triggerRadarrMovieSearch(createdMovie.id);
        } catch {
          // Ignore if search trigger fails
        }
      }

      if (autoDownload && createdMovie?.id) {
        if (createdMovie.hasFile && createdMovie.movieFile) {
          onAutoDownloadReadyRef.current?.(createdMovie);
        } else {
          updateAutoDownloadIds(ids => new Set(ids).add(createdMovie.id));
        }
      }

      await loadMovies();
      closeAddMovie();
      return true;
    } catch (e: unknown) {
      const errMsg = parseRadarrErrorMessage(e);
      setAddMovieError(errMsg);
      return false;
    } finally {
      setIsAddingMovie(false);
    }
  };

  // Change the quality profile of a library movie, then ask Radarr to search again
  const handleChangeMovieQuality = async (movieId: number, qualityProfileId: number) => {
    if (!radarrUrl || !radarrKey) return false;

    try {
      const updated = await updateRadarrMovieQuality(movieId, qualityProfileId);
      await triggerRadarrMovieSearch(movieId);
      if (updated?.id) {
        setSelectedMovie(prev => (prev?.id === movieId ? updated : prev));
        setMovies(prev => prev.map(m => (m.id === movieId ? updated : m)));
      }
      return true;
    } catch (e: unknown) {
      setActionError(`Changement de qualité impossible : ${readErrorMessage(e)}`);
      return false;
    }
  };

  const handleDeleteServerMovie = async (movieId: number) => {
    if (!radarrUrl || !radarrKey) return;

    try {
      await deleteRadarrMovie(movieId);
      setSelectedMovie(null);
      await loadMovies();
    } catch (e: unknown) {
      setActionError(`Suppression impossible : ${readErrorMessage(e)}`);
    }
  };

  const getMovieStatus = useCallback(
    (movie: { id?: number; tmdbId?: number; hasFile?: boolean }): 'local' | 'server' | 'unavailable' => {
      const movieId = movie.id;
      if (movieId && downloads[`movie-${movieId}`]?.status === 'completed') {
        return 'local';
      }
      if (movie.hasFile) {
        return 'server';
      }
      return 'unavailable';
    },
    [downloads]
  );

  const findInLibrary = useCallback(
    (tmdbId: number): Movie | undefined => {
      return movies.find(m => m.tmdbId === tmdbId);
    },
    [movies]
  );

  // Categorized movies
  const localMovies = useMemo(() => {
    return movies
      .filter(m => {
        const dl = downloads[`movie-${m.id}`];
        return dl?.status === 'completed' || dl?.status === 'downloading' || dl?.status === 'paused';
      })
      .sort((a, b) => {
        const dlA = downloads[`movie-${a.id}`];
        const dlB = downloads[`movie-${b.id}`];
        const isCompletedA = dlA?.status === 'completed';
        const isCompletedB = dlB?.status === 'completed';
        if (isCompletedA && !isCompletedB) return -1;
        if (!isCompletedA && isCompletedB) return 1;
        return 0;
      });
  }, [movies, downloads]);

  const serverMovies = useMemo(() => {
    return movies.filter(m => {
      const dl = downloads[`movie-${m.id}`];
      const isLocal = dl?.status === 'completed' || dl?.status === 'downloading' || dl?.status === 'paused';
      return !isLocal;
    });
  }, [movies, downloads]);

  const handleCancelQueueItem = useCallback(async (queueId: number) => {
    if (!radarrUrl || !radarrKey) return;
    try {
      await deleteRadarrQueueItem(queueId);
      const queueMap = await fetchRadarrQueue();
      setRadarrQueue(queueMap);
    } catch (e: unknown) {
      setActionError(`Annulation impossible : ${readErrorMessage(e)}`);
    }
  }, [radarrUrl, radarrKey]);

  return {
    movies,
    localMovies,
    serverMovies,
    radarrQueue,
    selectedMovie,
    setSelectedMovie,
    selectMovie,
    addingMovie,
    openAddMovie,
    closeAddMovie,
    qualityProfiles,
    selectedQuality,
    setSelectedQuality,
    isAddingMovie,
    addMovieError,
    handleAddMovie,
    handleDeleteServerMovie,
    handleChangeMovieQuality,
    handleCancelQueueItem,
    getMovieStatus,
    findInLibrary,
    loadMovies,
    autoDownloadIds,
    loadError,
    actionError,
    clearActionError: () => setActionError(null),
  };
}

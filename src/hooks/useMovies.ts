import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Config, DownloadInfo, LookupMovie, Movie, QualityProfile, QueueRecord } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import {
  fetchRadarrMovies,
  fetchRadarrMovie,
  fetchQualityProfiles as apiFetchQualityProfiles,
  addRadarrMovie,
  triggerRadarrMovieSearch,
  deleteRadarrMovie,
  fetchRadarrQueue,
} from '../services/radarr';

interface UseMoviesProps {
  config: Config;
  downloads: Record<number, DownloadInfo>;
  onMoviesFetched?: (movies: Movie[]) => void;
  onAutoDownloadReady?: (movie: Movie) => void;
}

export function useMovies({
  config,
  downloads,
  onMoviesFetched,
  onAutoDownloadReady,
}: UseMoviesProps) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

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
    } catch (_e) {
      // ignore
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

  // Check if any auto-download marked movie is now available with file
  const checkAutoDownloads = useCallback((moviesList: Movie[]) => {
    const currentAutoIds = autoDownloadIdsRef.current;
    if (currentAutoIds.size === 0) return;

    const remainingIds = new Set(currentAutoIds);
    let changed = false;

    for (const movie of moviesList) {
      if (remainingIds.has(movie.id) && movie.hasFile && movie.movieFile) {
        remainingIds.delete(movie.id);
        changed = true;
        onAutoDownloadReadyRef.current?.(movie);
      }
    }

    if (changed) {
      setAutoDownloadIds(remainingIds);
      try {
        localStorage.setItem(
          STORAGE_KEYS.AUTO_DOWNLOAD,
          JSON.stringify(Array.from(remainingIds))
        );
      } catch (_e) {
        // ignore
      }
    }
  }, []);

  // Fetch movies from Radarr
  const loadMovies = useCallback(async (cfg?: Config) => {
    const baseUrl = cfg?.['RADARR_BASE_URL'] || radarrUrl;
    const apiKey = cfg?.['RADARR_API_KEY'] || radarrKey;
    if (!baseUrl || !apiKey) return;

    try {
      const allMovies = await fetchRadarrMovies(baseUrl, apiKey);
      setMovies(allMovies);
      onMoviesFetchedRef.current?.(allMovies);
      checkAutoDownloads(allMovies);
    } catch (_e) {
      // ignore
    }
  }, [radarrUrl, radarrKey, checkAutoDownloads]);

  // Load movies when Radarr config keys change
  useEffect(() => {
    if (radarrUrl && radarrKey) {
      loadMovies();
    }
  }, [radarrUrl, radarrKey, loadMovies]);

  // Periodic library refresh (every 12s) + window focus
  useEffect(() => {
    if (!radarrUrl || !radarrKey) return;

    const interval = setInterval(() => {
      loadMovies();
    }, 12000);

    const handleFocus = () => {
      loadMovies();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [radarrUrl, radarrKey, loadMovies]);

  // Poll Radarr queue every 3 seconds & detect completion
  useEffect(() => {
    if (!radarrUrl || !radarrKey) return;

    const poll = async () => {
      try {
        const queueMap = await fetchRadarrQueue(radarrUrl, radarrKey);
        setRadarrQueue(queueMap);

        const currentKeys = new Set(Object.keys(queueMap).map(Number));
        let completedAny = false;
        for (const prevId of prevQueueKeysRef.current) {
          if (!currentKeys.has(prevId)) {
            completedAny = true;
            break;
          }
        }
        prevQueueKeysRef.current = currentKeys;

        if (completedAny) {
          loadMovies();
        }
      } catch (_e) {
        // ignore
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [radarrUrl, radarrKey, loadMovies]);

  // Select movie and immediately fetch fresh state from server
  const selectMovie = useCallback(
    async (movie: Movie) => {
      setSelectedMovie(movie);
      if (radarrUrl && radarrKey) {
        try {
          const fresh = await fetchRadarrMovie(radarrUrl, radarrKey, movie.id);
          if (fresh && fresh.id) {
            setSelectedMovie(prev => (prev?.id === movie.id ? fresh : prev));
            setMovies(prev => prev.map(m => (m.id === movie.id ? fresh : m)));
            if (fresh.hasFile && fresh.movieFile && autoDownloadIdsRef.current.has(fresh.id)) {
              checkAutoDownloads([fresh]);
            }
          }
        } catch (_e) {
          // ignore
        }
      }
    },
    [radarrUrl, radarrKey, checkAutoDownloads]
  );

  // Quality profiles
  const loadQualityProfiles = useCallback(async () => {
    if (!radarrUrl || !radarrKey) return;

    try {
      const data = await apiFetchQualityProfiles(radarrUrl, radarrKey);
      setQualityProfiles(data);
      if (data.length > 0 && !selectedQuality) {
        setSelectedQuality(data[0].id);
      }
    } catch (_e) {
      // ignore
    }
  }, [radarrUrl, radarrKey, selectedQuality]);

  const openAddMovie = (lookupMovie: LookupMovie) => {
    setAddingMovie(lookupMovie);
    setAddMovieError(null);
    setIsAddingMovie(false);
    loadQualityProfiles();
  };

  const closeAddMovie = () => {
    setAddingMovie(null);
    setAddMovieError(null);
    setIsAddingMovie(false);
  };

  const handleAddMovie = async (autoDownload: boolean = false) => {
    if (!addingMovie || !selectedQuality || !radarrUrl || !radarrKey) return false;
    const rootFolder = config['RADARR_ROOT_FOLDER'] || '/movies';

    setIsAddingMovie(true);
    setAddMovieError(null);

    try {
      const createdMovie = await addRadarrMovie({
        baseUrl: radarrUrl,
        apiKey: radarrKey,
        rootFolder,
        tmdbId: addingMovie.tmdbId,
        title: addingMovie.title,
        year: addingMovie.year,
        qualityProfileId: selectedQuality,
      });

      if (createdMovie?.id) {
        try {
          await triggerRadarrMovieSearch(radarrUrl, radarrKey, createdMovie.id);
        } catch (_e) {
          // ignore if already searching
        }
      }

      if (autoDownload && createdMovie?.id) {
        if (createdMovie.hasFile && createdMovie.movieFile) {
          onAutoDownloadReadyRef.current?.(createdMovie);
        } else {
          setAutoDownloadIds(prev => {
            const next = new Set(prev).add(createdMovie.id);
            try {
              localStorage.setItem(
                STORAGE_KEYS.AUTO_DOWNLOAD,
                JSON.stringify(Array.from(next))
              );
            } catch (_e) {
              // ignore
            }
            return next;
          });
        }
      }

      await loadMovies();
      closeAddMovie();
      return true;
    } catch (e: any) {
      const errMsg = typeof e === 'string' ? e : e?.message || 'Erreur inconnue';
      setAddMovieError(errMsg);
      return false;
    } finally {
      setIsAddingMovie(false);
    }
  };

  const handleDeleteServerMovie = async (movieId: number) => {
    if (!radarrUrl || !radarrKey) return;

    try {
      await deleteRadarrMovie(radarrUrl, radarrKey, movieId);
      setSelectedMovie(null);
      await loadMovies();
    } catch (_e) {
      // ignore
    }
  };

  const getMovieStatus = useCallback(
    (movie: { id?: number; tmdbId?: number; hasFile?: boolean }): 'local' | 'server' | 'unavailable' => {
      const movieId = movie.id;
      if (movieId && downloads[movieId]?.status === 'completed') {
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
        const dl = downloads[m.id];
        return dl?.status === 'completed' || dl?.status === 'downloading' || dl?.status === 'paused';
      })
      .sort((a, b) => {
        const dlA = downloads[a.id];
        const dlB = downloads[b.id];
        const isCompletedA = dlA?.status === 'completed';
        const isCompletedB = dlB?.status === 'completed';
        if (isCompletedA && !isCompletedB) return -1;
        if (!isCompletedA && isCompletedB) return 1;
        return 0;
      });
  }, [movies, downloads]);

  const serverMovies = useMemo(() => {
    return movies.filter(m => {
      const dl = downloads[m.id];
      const isLocal = dl?.status === 'completed' || dl?.status === 'downloading' || dl?.status === 'paused';
      return !isLocal;
    });
  }, [movies, downloads]);

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
    getMovieStatus,
    findInLibrary,
    loadMovies,
    autoDownloadIds,
  };
}

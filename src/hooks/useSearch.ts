import { useState, useRef, useCallback } from 'react';
import { Config, LookupMovie, LookupSeries } from '../types';
import { searchRadarrMovies } from '../services/radarr';
import { searchSonarrSeries } from '../services/sonarr';

export function useSearch(config: Config) {
  // Movie search
  const [movieSearchQuery, setMovieSearchQuery] = useState('');
  const [movieSearchResults, setMovieSearchResults] = useState<LookupMovie[]>([]);
  const [isMovieSearching, setIsMovieSearching] = useState(false);
  const movieTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movieRequestIdRef = useRef(0);

  // Series search
  const [seriesSearchQuery, setSeriesSearchQuery] = useState('');
  const [seriesSearchResults, setSeriesSearchResults] = useState<LookupSeries[]>([]);
  const [isSeriesSearching, setIsSeriesSearching] = useState(false);
  const seriesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesRequestIdRef = useRef(0);

  const handleMovieSearch = useCallback(
    (term: string) => {
      setMovieSearchQuery(term);
      if (movieTimer.current) clearTimeout(movieTimer.current);
      const requestId = ++movieRequestIdRef.current;

      if (!term.trim()) {
        setMovieSearchResults([]);
        setIsMovieSearching(false);
        return;
      }

      setIsMovieSearching(true);
      movieTimer.current = setTimeout(async () => {
        const baseUrl = config['RADARR_BASE_URL'];
        const apiKey = config['RADARR_API_KEY'];
        if (!baseUrl || !apiKey) {
          if (requestId === movieRequestIdRef.current) {
            setIsMovieSearching(false);
          }
          return;
        }

        try {
          const data = await searchRadarrMovies(baseUrl, apiKey, term);
          if (requestId === movieRequestIdRef.current) {
            setMovieSearchResults(data);
          }
        } catch {
          // Ignore search error gracefully to reset results
          if (requestId === movieRequestIdRef.current) {
            setMovieSearchResults([]);
          }
        } finally {
          if (requestId === movieRequestIdRef.current) {
            setIsMovieSearching(false);
          }
        }
      }, 350);
    },
    [config]
  );

  const clearMovieSearch = useCallback(() => {
    movieRequestIdRef.current++;
    if (movieTimer.current) clearTimeout(movieTimer.current);
    setMovieSearchQuery('');
    setMovieSearchResults([]);
    setIsMovieSearching(false);
  }, []);

  const handleSeriesSearch = useCallback(
    (term: string) => {
      setSeriesSearchQuery(term);
      if (seriesTimer.current) clearTimeout(seriesTimer.current);
      const requestId = ++seriesRequestIdRef.current;

      if (!term.trim()) {
        setSeriesSearchResults([]);
        setIsSeriesSearching(false);
        return;
      }

      setIsSeriesSearching(true);
      seriesTimer.current = setTimeout(async () => {
        const baseUrl = config['SONARR_BASE_URL'];
        const apiKey = config['SONARR_API_KEY'];
        if (!baseUrl || !apiKey) {
          if (requestId === seriesRequestIdRef.current) {
            setIsSeriesSearching(false);
          }
          return;
        }

        try {
          const data = await searchSonarrSeries(baseUrl, apiKey, term);
          if (requestId === seriesRequestIdRef.current) {
            setSeriesSearchResults(data);
          }
        } catch {
          // Ignore search error gracefully to reset results
          if (requestId === seriesRequestIdRef.current) {
            setSeriesSearchResults([]);
          }
        } finally {
          if (requestId === seriesRequestIdRef.current) {
            setIsSeriesSearching(false);
          }
        }
      }, 350);
    },
    [config]
  );

  const clearSeriesSearch = useCallback(() => {
    seriesRequestIdRef.current++;
    if (seriesTimer.current) clearTimeout(seriesTimer.current);
    setSeriesSearchQuery('');
    setSeriesSearchResults([]);
    setIsSeriesSearching(false);
  }, []);

  return {
    // Movies
    searchQuery: movieSearchQuery,
    searchResults: movieSearchResults,
    isSearching: isMovieSearching,
    handleSearch: handleMovieSearch,
    clearSearch: clearMovieSearch,
    // Series
    seriesSearchQuery,
    seriesSearchResults,
    isSeriesSearching,
    handleSeriesSearch,
    clearSeriesSearch,
  };
}

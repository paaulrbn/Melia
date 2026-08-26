import { useState, useRef, useCallback } from 'react';
import { Config, LookupMovie } from '../types';
import { searchRadarrMovies } from '../services/radarr';

export function useSearch(config: Config) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LookupMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (term: string) => {
      setSearchQuery(term);

      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }

      if (!term.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      searchTimer.current = setTimeout(async () => {
        const baseUrl = config['RADARR_BASE_URL'];
        const apiKey = config['RADARR_API_KEY'];
        if (!baseUrl || !apiKey) {
          setIsSearching(false);
          return;
        }

        try {
          const data = await searchRadarrMovies(baseUrl, apiKey, term);
          setSearchResults(data);
        } catch (_e) {
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 400);
    },
    [config]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  return {
    searchQuery,
    searchResults,
    isSearching,
    handleSearch,
    clearSearch,
  };
}

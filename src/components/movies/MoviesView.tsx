import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { Search, Settings, X } from 'lucide-react';
import { Button, Input, IconButton } from '../ui';
import { MovieCard } from './MovieCard';

const SKELETON_CARDS = 10;

interface MoviesViewProps {
  readonly searchQuery: string;
  readonly searchResults: LookupMovie[];
  readonly isSearching: boolean;
  readonly onSearchChange: (term: string) => void;
  readonly onClearSearch: () => void;
  readonly movies: Movie[];
  readonly localMovies: Movie[];
  readonly serverMovies: Movie[];
  readonly downloads: Record<string, DownloadInfo>;
  readonly radarrQueue: Record<number, QueueRecord>;
  readonly findInLibrary: (tmdbId: number) => Movie | undefined;
  readonly onSelectMovie: (movie: Movie) => void;
  readonly onOpenAddMovie: (lookupMovie: LookupMovie) => void;
  readonly isConfigLoaded: boolean;
  readonly isConfigured: boolean;
  readonly hasLoaded: boolean;
  readonly hasLoadError: boolean;
  readonly onOpenSettings: () => void;
}

export function MoviesView({
  searchQuery,
  searchResults,
  isSearching,
  onSearchChange,
  onClearSearch,
  movies,
  localMovies,
  serverMovies,
  downloads,
  radarrQueue,
  findInLibrary,
  onSelectMovie,
  onOpenAddMovie,
  isConfigLoaded,
  isConfigured,
  hasLoaded,
  hasLoadError,
  onOpenSettings,
}: Readonly<MoviesViewProps>) {
  const isSearchActive = searchQuery.trim().length > 0;

  const renderSearchContent = () => {
    if (isSearching) {
      return (
        <div className="loading-state">
          <p>Recherche en cours…</p>
        </div>
      );
    }
    if (searchResults.length === 0) {
      return (
        <div className="loading-state">
          <p>Aucun résultat pour «&nbsp;{searchQuery}&nbsp;»</p>
        </div>
      );
    }
    return (
      <div className="movie-grid">
        {searchResults.map(lookupMovie => {
          const libraryMovie = findInLibrary(lookupMovie.tmdbId);
          return (
            <MovieCard
              key={lookupMovie.tmdbId}
              movie={lookupMovie}
              isAddHint={!libraryMovie}
              onClick={() => {
                if (libraryMovie) {
                  onSelectMovie(libraryMovie);
                } else {
                  onOpenAddMovie(lookupMovie);
                }
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderLibraryContent = () => {
    if (isConfigLoaded && !isConfigured) {
      return (
        <div className="empty-state">
          <p>Radarr n'est pas configuré.</p>
          <Button variant="secondary" leftIcon={<Settings size={16} />} onClick={onOpenSettings}>
            Ouvrir les paramètres
          </Button>
        </div>
      );
    }
    if (movies.length === 0) {
      // The StatusBanner above already explains a failed load
      if (hasLoadError) return null;
      if (!hasLoaded) {
        return (
          <div className="movie-grid" role="status" aria-label="Chargement de la bibliothèque…">
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <div key={i} className="movie-skeleton" aria-hidden="true" />
            ))}
          </div>
        );
      }
      return (
        <div className="empty-state">
          <p>Aucun film dans la bibliothèque. Recherchez un film pour l'ajouter.</p>
        </div>
      );
    }
    return (
      <div className="movie-categories">
        {localMovies.length > 0 && (
          <div className="movie-category">
            <h3 className="category-title">Mes films</h3>
            <div className="movie-grid">
              {localMovies.map(movie => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  download={downloads[`movie-${movie.id}`]}
                  onClick={() => onSelectMovie(movie)}
                />
              ))}
            </div>
          </div>
        )}

        {serverMovies.length > 0 && (
          <div className="movie-category">
            <h3 className="category-title">Sur le serveur</h3>
            <div className="movie-grid">
              {serverMovies.map(movie => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  queueItem={radarrQueue[movie.id]}
                  onClick={() => onSelectMovie(movie)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2>Films</h2>

      {/* Search bar */}
      <div className="search-bar">
        <Input
          type="text"
          inputSize="lg"
          placeholder="Rechercher un film…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          leftIcon={<Search size={18} />}
          rightElement={
            searchQuery ? (
              <IconButton
                icon={<X size={16} />}
                onClick={onClearSearch}
                aria-label="Effacer la recherche"
                size="sm"
                shape="circle"
                variant="ghost"
                className="search-clear"
              />
            ) : undefined
          }
        />
      </div>

      {/* Search results or library */}
      {isSearchActive ? renderSearchContent() : renderLibraryContent()}
    </div>
  );
}

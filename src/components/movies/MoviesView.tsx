import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { Search, X } from 'lucide-react';
import { Input, IconButton } from '../ui';
import { MovieCard } from './MovieCard';

interface MoviesViewProps {
  searchQuery: string;
  searchResults: LookupMovie[];
  isSearching: boolean;
  onSearchChange: (term: string) => void;
  onClearSearch: () => void;
  movies: Movie[];
  localMovies: Movie[];
  serverMovies: Movie[];
  downloads: Record<number, DownloadInfo>;
  radarrQueue: Record<number, QueueRecord>;
  findInLibrary: (tmdbId: number) => Movie | undefined;
  onSelectMovie: (movie: Movie) => void;
  onOpenAddMovie: (lookupMovie: LookupMovie) => void;
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
}: MoviesViewProps) {
  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div>
      <h2>Films</h2>

      {/* Search bar */}
      <div className="search-bar">
        <Input
          type="text"
          inputSize="lg"
          placeholder="Rechercher un film..."
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

      {/* Search results */}
      {isSearchActive ? (
        isSearching ? (
          <div className="loading-state">
            <p>Recherche en cours...</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="loading-state">
            <p>Aucun résultat pour "{searchQuery}"</p>
          </div>
        ) : (
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
        )
      ) : movies.length === 0 ? (
        <div className="loading-state">
          <p>Chargement de la bibliothèque ou serveur non configuré...</p>
        </div>
      ) : (
        /* Library categorized */
        <div className="movie-categories">
          {localMovies.length > 0 && (
            <div className="movie-category">
              <h3 className="category-title">Mes films</h3>
              <div className="movie-grid">
                {localMovies.map(movie => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    download={downloads[movie.id]}
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
      )}
    </div>
  );
}

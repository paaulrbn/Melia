import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { Settings } from 'lucide-react';
import { Button } from '../ui';
import { MovieGroup, movieGroupHeadingId, movieGroupSectionId } from '../../utils/movieGroups';
import { MovieCard } from './MovieCard';

const SKELETON_CARDS = 10;

interface MoviesViewProps {
  readonly searchQuery: string;
  readonly searchResults: LookupMovie[];
  readonly isSearching: boolean;
  readonly movies: Movie[];
  readonly movieGroups: MovieGroup[];
  readonly downloads: Record<string, DownloadInfo>;
  readonly radarrQueue: Record<number, QueueRecord>;
  readonly findInLibrary: (tmdbId: number) => Movie | undefined;
  /** Opens the detail page; `trigger` takes the focus back when it closes. */
  readonly onSelectMovie: (movie: Movie, trigger: HTMLElement) => void;
  /** Opens the page that adds a search result; `trigger` takes the focus back when it closes. */
  readonly onOpenAddMovie: (lookupMovie: LookupMovie, trigger: HTMLElement) => void;
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
  movies,
  movieGroups,
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
              onClick={event => {
                if (libraryMovie) {
                  onSelectMovie(libraryMovie, event.currentTarget);
                } else {
                  onOpenAddMovie(lookupMovie, event.currentTarget);
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
        {movieGroups.map(group => (
          <section
            key={group.key}
            id={movieGroupSectionId(group.key)}
            className="movie-category"
            aria-labelledby={movieGroupHeadingId(group.key)}
          >
            <h3
              className="category-title"
              id={movieGroupHeadingId(group.key)}
              tabIndex={-1}
              aria-label={`${group.title}, ${group.movies.length} ${group.movies.length > 1 ? 'films' : 'film'}`}
            >
              <span>{group.title}</span>
              <span className="category-count">{group.movies.length}</span>
            </h3>
            <div className="movie-grid">
              {group.movies.map(movie => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  download={downloads[`movie-${movie.id}`]}
                  queueItem={radarrQueue[movie.id]}
                  onClick={event => onSelectMovie(movie, event.currentTarget)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  };

  // Title and search field live in the top row (PageToolbar)
  return <div>{isSearchActive ? renderSearchContent() : renderLibraryContent()}</div>;
}

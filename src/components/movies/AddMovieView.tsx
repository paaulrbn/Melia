import { useState, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { LookupMovie, QualityProfile } from '../../types';
import { formatDuration } from '../../utils/formatters';
import { getImageUrl } from '../../utils/media';
import { Checkbox } from '../ui';
import { MovieDetailLayout, QualityPicker } from './MovieDetailLayout';

interface AddMovieViewProps {
  readonly movie: LookupMovie;
  readonly qualityProfiles: QualityProfile[];
  readonly selectedQuality: number | null;
  readonly setSelectedQuality: (id: number) => void;
  readonly isAdding: boolean;
  readonly error: string | null;
  /** Status banners of the movies screen (server unreachable, failed action). */
  readonly notices?: ReactNode;
  readonly onAdd: (autoDownload: boolean) => void;
}

/**
 * Page of a movie found by the search and not in the library yet: same layout as a
 * library movie, with the quality and "Ajouter" in place of the play actions.
 */
export function AddMovieView({
  movie,
  qualityProfiles,
  selectedQuality,
  setSelectedQuality,
  isAdding,
  error,
  notices,
  onAdd,
}: Readonly<AddMovieViewProps>) {
  const [autoDownload, setAutoDownload] = useState(false);

  let status = '';
  if (isAdding) status = 'Ajout en cours… Le serveur cherche le film.';
  else if (error) status = `Ajout impossible : ${error}`;

  return (
    <MovieDetailLayout
      title={movie.title}
      fanartUrl={getImageUrl(movie, 'fanart')}
      posterUrl={getImageUrl(movie, 'poster')}
      facts={
        <>
          {movie.year > 0 && <li>{movie.year}</li>}
          {movie.runtime ? <li>{formatDuration(movie.runtime)}</li> : null}
        </>
      }
      primary={
        <div className="movie-detail-add">
          {/* Main action first, quality next to it at the same height */}
          <div className="movie-detail-actions movie-detail-actions--add">
            <button
              type="button"
              className="movie-detail-play"
              onClick={() => onAdd(autoDownload)}
              disabled={isAdding || !selectedQuality}
              aria-busy={isAdding}
            >
              {isAdding ? (
                <Loader2 className="movie-detail-play-icon animate-spin" size={22} aria-hidden="true" />
              ) : (
                <Plus className="movie-detail-play-icon" size={22} aria-hidden="true" />
              )}
              Ajouter
            </button>
            {qualityProfiles.length > 0 && (
              <QualityPicker
                profiles={qualityProfiles}
                value={selectedQuality}
                onChange={setSelectedQuality}
                disabled={isAdding}
              />
            )}
          </div>

          <Checkbox
            checked={autoDownload}
            onChange={e => setAutoDownload(e.target.checked)}
            disabled={isAdding}
            label="Télécharger sur cet ordinateur dès qu’il est disponible sur le serveur"
            containerClassName="movie-detail-option"
          />

          {/* Always in the DOM so progress and errors are announced when they appear */}
          <p
            className={`movie-detail-status${!isAdding && error ? ' movie-detail-status--error' : ''}`}
            role="status"
          >
            {status}
          </p>
        </div>
      }
      notices={notices}
      overview={movie.overview}
    />
  );
}

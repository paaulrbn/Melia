import { useState } from 'react';
import { LookupMovie, QualityProfile } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Modal } from '../common/Modal';

interface AddMovieModalProps {
  movie: LookupMovie | null;
  qualityProfiles: QualityProfile[];
  selectedQuality: number | null;
  setSelectedQuality: (id: number) => void;
  isAdding: boolean;
  error: string | null;
  onAdd: (autoDownload: boolean) => void;
  onClose: () => void;
}

export function AddMovieModal({
  movie,
  qualityProfiles,
  selectedQuality,
  setSelectedQuality,
  isAdding,
  error,
  onAdd,
  onClose,
}: AddMovieModalProps) {
  const [autoDownload, setAutoDownload] = useState(false);

  if (!movie) return null;

  const fanartUrl = getImageUrl(movie, 'fanart');

  const handleClose = () => {
    setAutoDownload(false);
    onClose();
  };

  return (
    <Modal isOpen={!!movie} onClose={handleClose}>
      <div
        className="modal-header"
        style={{ backgroundImage: fanartUrl ? `url(${fanartUrl})` : undefined }}
      >
        <div className="modal-header-gradient">
          <div className="modal-title-area">
            <h2>
              {movie.title} <span className="modal-year">({movie.year})</span>
            </h2>
          </div>
        </div>
      </div>

      <div className="modal-body">
        <p className="overview">{movie.overview || 'Aucun résumé disponible.'}</p>

        {error && <p className="add-movie-error">{error}</p>}

        {isAdding ? (
          <div className="add-movie-progress">
            <div className="progress-container">
              <div className="progress-bar add-progress-bar" />
            </div>
            <p className="add-movie-progress-text">
              Ajout en cours… Radarr lance la recherche du film sur le serveur.
            </p>
          </div>
        ) : (
          <div className="add-movie-container">
            <div className="add-movie-row">
              <div className="quality-selector">
                <label htmlFor="quality-profile-select">Qualité :</label>
                <select
                  id="quality-profile-select"
                  className="quality-select"
                  value={selectedQuality || ''}
                  onChange={e => setSelectedQuality(Number(e.target.value))}
                >
                  {qualityProfiles.map(qp => (
                    <option key={qp.id} value={qp.id}>
                      {qp.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={autoDownload}
                  onChange={e => setAutoDownload(e.target.checked)}
                  className="custom-checkbox"
                />
                <span className="checkbox-text">
                  Télécharger en local dès que disponible sur le serveur
                </span>
              </label>
            </div>

            <div className="add-movie-actions">
              <button
                className="btn-primary"
                onClick={() => onAdd(autoDownload)}
                disabled={!selectedQuality}
              >
                + Ajouter au serveur
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { LookupMovie, QualityProfile } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Modal } from '../common/Modal';
import { Plus } from 'lucide-react';
import { Button, Select, Checkbox, ProgressBar } from '../ui';

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
            <ProgressBar indeterminate size="md" />
            <p className="add-movie-progress-text">
              Ajout en cours… Recherche du film sur le serveur.
            </p>
          </div>
        ) : (
          <div className="add-movie-container">
            <div className="add-movie-row">
              <div className="quality-selector">
                <Select
                  label="Qualité :"
                  value={selectedQuality || ''}
                  onChange={e => setSelectedQuality(Number(e.target.value))}
                  options={qualityProfiles.map(qp => ({
                    value: qp.id,
                    label: qp.name,
                  }))}
                  style={{ minWidth: '200px' }}
                />
              </div>

              <Checkbox
                checked={autoDownload}
                onChange={e => setAutoDownload(e.target.checked)}
                label="Télécharger en local dès que disponible sur le serveur"
              />
            </div>

            <div className="add-movie-actions">
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Plus size={20} />}
                onClick={() => onAdd(autoDownload)}
                disabled={!selectedQuality}
              >
                Ajouter au serveur
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

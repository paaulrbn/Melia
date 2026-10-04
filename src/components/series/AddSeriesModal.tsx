import { LookupSeries, QualityProfile } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Modal } from '../common/Modal';
import { Plus } from 'lucide-react';
import { Button, Select, ProgressBar } from '../ui';

interface AddSeriesModalProps {
  readonly series: LookupSeries | null;
  readonly qualityProfiles: QualityProfile[];
  readonly selectedQuality: number | null;
  readonly setSelectedQuality: (id: number) => void;
  readonly isAdding: boolean;
  readonly error: string | null;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}

export function AddSeriesModal({
  series,
  qualityProfiles,
  selectedQuality,
  setSelectedQuality,
  isAdding,
  error,
  onAdd,
  onClose,
}: Readonly<AddSeriesModalProps>) {
  if (!series) return null;

  const fanartUrl = getImageUrl(series, 'fanart');

  return (
    <Modal isOpen={!!series} onClose={onClose}>
      <div
        className="modal-header"
        style={{ backgroundImage: fanartUrl ? `url(${fanartUrl})` : undefined }}
      >
        <div className="modal-header-gradient">
          <div className="modal-title-area">
            <h2>
              {series.title} <span className="modal-year">({series.year})</span>
            </h2>
          </div>
        </div>
      </div>

      <div className="modal-body">
        <p className="overview">{series.overview || 'Aucun résumé disponible.'}</p>

        {error && <p className="add-movie-error">{error}</p>}

        {isAdding ? (
          <div className="add-movie-progress">
            <ProgressBar indeterminate size="md" />
            <p className="add-movie-progress-text">
              Ajout de la série sur le serveur…
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
            </div>

            <div className="add-movie-actions">
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Plus size={20} />}
                onClick={onAdd}
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

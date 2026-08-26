import { DownloadInfo, Movie, QueueRecord } from '../../types';
import { formatSize } from '../../utils/formatters';
import { getImageUrl } from '../../utils/media';
import { Modal } from '../common/Modal';
import { PlayIcon, PauseIcon, TrashIcon } from '../common/Icons';

interface MovieDetailModalProps {
  movie: Movie | null;
  download?: DownloadInfo;
  queueItem?: QueueRecord;
  movieStatus: 'local' | 'server' | 'unavailable';
  onClose: () => void;
  onDownload: (movie: Movie) => void;
  onCancelDownload: (movieId: number) => void;
  onPlayLocal: (filePath: string) => void;
  onDeleteServerMovie: (movieId: number) => void;
}

export function MovieDetailModal({
  movie,
  download,
  queueItem,
  movieStatus,
  onClose,
  onDownload,
  onCancelDownload,
  onPlayLocal,
  onDeleteServerMovie,
}: MovieDetailModalProps) {
  if (!movie) return null;

  const fanartUrl = getImageUrl(movie, 'fanart');

  const renderActions = () => {
    if (movieStatus === 'unavailable') {
      if (queueItem) {
        let progress = 0;
        if (queueItem.size > 0) {
          progress = Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100);
        }

        return (
          <div className="download-active-section">
            <div className="progress-header">
              <span>Téléchargement serveur en cours... {progress}%</span>
              <span className="download-stats">{queueItem.timeleft || 'Calcul en cours...'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div className="progress-container" style={{ flex: 1, marginBottom: 0 }}>
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="modal-actions">
          <p className="unavailable-text">
            Ce film n'est pas encore disponible sur le serveur. Radarr est en attente de téléchargement.
          </p>
        </div>
      );
    }

    if (!download || download.status === 'error') {
      return (
        <div className="modal-actions">
          {movie.movieFile && (
            <button className="btn-primary" onClick={() => onDownload(movie)}>
              ⬇ Télécharger ce film
            </button>
          )}
          <button
            className="btn-cancel-small btn-icon"
            style={{ marginLeft: 'auto' }}
            onClick={() => onDeleteServerMovie(movie.id)}
            title="Supprimer du serveur"
            aria-label="Supprimer du serveur"
          >
            <TrashIcon size={18} />
          </button>
        </div>
      );
    }

    if (download.status === 'downloading' || download.status === 'paused') {
      return (
        <div className="download-active-section">
          <div className="progress-header">
            <span>
              {download.status === 'paused' ? 'Téléchargement en pause' : 'Téléchargement en cours...'} {download.progress}%
            </span>
            <span className="download-stats">
              <span>{download.sizeStr || download.stats}</span>
              {download.status === 'downloading' && download.speed && <span className="dl-separator">•</span>}
              {download.status === 'downloading' && download.speed && <span>{download.speed}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="progress-container" style={{ flex: 1, marginBottom: 0 }}>
              <div
                className={`progress-bar ${download.status === 'paused' ? 'paused' : ''}`}
                style={{ width: `${download.progress}%` }}
              />
            </div>
            <div className="dl-actions">
              {download.status === 'downloading' && (
                <button
                  className="btn-cancel-small btn-icon"
                  onClick={() => onCancelDownload(movie.id)}
                  title="Pause"
                  aria-label="Mettre en pause"
                >
                  <PauseIcon size={18} />
                </button>
              )}
              {download.status === 'paused' && (
                <button
                  className="btn-resume-small btn-icon"
                  onClick={() => onDownload(movie)}
                  title="Reprendre"
                  aria-label="Reprendre le téléchargement"
                >
                  <PlayIcon size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (download.status === 'completed' && download.path) {
      return (
        <div className="modal-actions">
          <button
            className="btn-primary"
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            onClick={() => onPlayLocal(download.path!)}
          >
            <PlayIcon size={20} />
            Lancer le film
          </button>
          <button
            className="btn-cancel-small btn-icon"
            style={{ marginLeft: 'auto' }}
            onClick={() => onDeleteServerMovie(movie.id)}
            title="Supprimer du serveur"
            aria-label="Supprimer du serveur"
          >
            <TrashIcon size={18} />
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal isOpen={!!movie} onClose={onClose}>
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
        {movie.movieFile && (
          <p className="file-size-info">{formatSize(movie.movieFile.size)}</p>
        )}

        {renderActions()}
      </div>
    </Modal>
  );
}

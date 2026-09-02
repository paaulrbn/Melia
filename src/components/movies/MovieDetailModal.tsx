import { useState } from 'react';
import { DownloadInfo, Movie, QueueRecord } from '../../types';
import { formatDuration, formatSize } from '../../utils/formatters';
import { getImageUrl } from '../../utils/media';
import { Modal } from '../common/Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Play, Pause, Trash2, Download } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '../ui';

interface MovieDetailModalProps {
  movie: Movie | null;
  download?: DownloadInfo;
  queueItem?: QueueRecord;
  movieStatus: 'local' | 'server' | 'unavailable';
  onClose: () => void;
  onDownload: (movie: Movie) => void;
  onCancelDownload: (movieId: number) => void;
  onPlayLocal: (filePath: string) => void;
  onDeleteDownload: (movieId: number, deleteFromDisk: boolean) => void;
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
  onDeleteDownload,
  onDeleteServerMovie,
}: MovieDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!movie) return null;

  const isLocalMovie = movieStatus === 'local' || (download?.status === 'completed' && !!download.path);
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
              <span className="download-stats download-stats--server">
                {queueItem.timeleft || 'Calcul en cours...'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <ProgressBar value={progress} variant="server" size="md" />
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="modal-actions">
          <p className="unavailable-text">
            Ce film n'est pas encore disponible sur le serveur. En attente de téléchargement.
          </p>
        </div>
      );
    }

    if (!download || download.status === 'error') {
      return (
        <div className="modal-actions">
          {movie.movieFile && (
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Download size={20} />}
              onClick={() => onDownload(movie)}
            >
              Télécharger ce film
            </Button>
          )}
          <IconButton
            icon={<Trash2 size={20} />}
            variant="danger"
            size="lg"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowDeleteConfirm(true)}
            title="Supprimer du serveur"
            aria-label="Supprimer du serveur"
          />
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
            <div style={{ flex: 1 }}>
              <ProgressBar
                value={download.progress}
                isPaused={download.status === 'paused'}
                size="md"
              />
            </div>
            <div className="dl-actions">
              {download.status === 'downloading' && (
                <IconButton
                  icon={<Pause size={18} fill="currentColor" />}
                  variant="secondary"
                  size="md"
                  onClick={() => onCancelDownload(movie.id)}
                  title="Pause"
                  aria-label="Mettre en pause"
                />
              )}
              {download.status === 'paused' && (
                <IconButton
                  icon={<Play size={18} fill="currentColor" />}
                  variant="secondary"
                  size="md"
                  onClick={() => onDownload(movie)}
                  title="Reprendre"
                  aria-label="Reprendre le téléchargement"
                />
              )}
            </div>
          </div>
        </div>
      );
    }

    if (download.status === 'completed' && download.path) {
      return (
        <div className="modal-actions">
          <Button
            variant="primary"
            size="lg"
            leftIcon={<Play size={20} fill="currentColor" />}
            onClick={() => onPlayLocal(download.path!)}
          >
            Lancer le film
          </Button>
          <IconButton
            icon={<Trash2 size={20} />}
            variant="danger"
            size="lg"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowDeleteConfirm(true)}
            title="Supprimer des téléchargements"
            aria-label="Supprimer le téléchargement local"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <>
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
          {(movie.runtime || movie.movieFile) && (
            <div className="modal-meta-row">
              {movie.runtime && movie.runtime > 0 ? (
                <span className="movie-runtime">{formatDuration(movie.runtime)}</span>
              ) : null}
              {movie.runtime && movie.runtime > 0 && movie.movieFile ? (
                <span className="meta-dot">•</span>
              ) : null}
              {movie.movieFile && (
                <span className="file-size-info">{formatSize(movie.movieFile.size)}</span>
              )}
            </div>
          )}

          <p className="overview">{movie.overview || 'Aucun résumé disponible.'}</p>

          {renderActions()}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={isLocalMovie ? 'Supprimer le téléchargement' : 'Supprimer du serveur'}
        message={
          isLocalMovie ? (
            <>
              Voulez-vous vraiment supprimer <strong>{movie.title} ({movie.year})</strong> de vos téléchargements locaux&nbsp;?
              Le fichier vidéo sera définitivement effacé de votre disque.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer <strong>{movie.title} ({movie.year})</strong> du serveur&nbsp;?
              Le film et ses fichiers vidéo associés seront définitivement effacés.
            </>
          )
        }
        confirmLabel={isLocalMovie ? 'Supprimer le fichier' : 'Supprimer du serveur'}
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          if (isLocalMovie) {
            onDeleteDownload(movie.id, true);
          } else {
            onDeleteServerMovie(movie.id);
          }
          onClose();
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

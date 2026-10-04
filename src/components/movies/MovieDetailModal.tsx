import { useState } from 'react';
import { Config, DownloadInfo, Movie, QueueRecord } from '../../types';
import { formatDuration, formatSize } from '../../utils/formatters';
import { getImageUrl, getStreamUrl } from '../../utils/media';
import { Modal } from '../common/Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Play, Pause, Trash2, Download, X } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '../ui';

interface MovieDetailModalProps {
  readonly movie: Movie | null;
  readonly download?: DownloadInfo;
  readonly queueItem?: QueueRecord;
  readonly movieStatus: 'local' | 'server' | 'unavailable';
  readonly config: Config;
  readonly onClose: () => void;
  readonly onDownload: (movie: Movie) => void;
  readonly onCancelDownload: (id: string) => void;
  readonly onPlayStream: (streamUrl: string, title?: string) => void;
  readonly onPlayLocal: (filePath: string, title?: string) => void;
  readonly onDeleteDownload: (id: string, deleteFromDisk: boolean, fallbackFilename?: string) => void;
  readonly onDeleteServerMovie: (movieId: number) => void;
  readonly onCancelServerQueue?: (queueId: number) => void;
}

export function MovieDetailModal({
  movie,
  download,
  queueItem,
  movieStatus,
  config,
  onClose,
  onDownload,
  onCancelDownload,
  onPlayStream,
  onPlayLocal,
  onDeleteDownload,
  onDeleteServerMovie,
  onCancelServerQueue,
}: Readonly<MovieDetailModalProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelDownloadConfirm, setShowCancelDownloadConfirm] = useState(false);
  const [showCancelServerQueueConfirm, setShowCancelServerQueueConfirm] = useState(false);

  if (!movie) return null;

  const isLocalMovie = movieStatus === 'local' || (download?.status === 'completed' && !!download.path);
  const isServerAvailable = movie.hasFile && !!movie.movieFile;
  const isPlayable = isLocalMovie || isServerAvailable;
  const isDownloading = download?.status === 'downloading';
  const isPaused = download?.status === 'paused';
  const fanartUrl = getImageUrl(movie, 'fanart');

  const handlePlayMovie = () => {
    if (isLocalMovie && download?.path) {
      onPlayLocal(download.path, movie.title);
    } else if (movie.movieFile?.path) {
      const streamUrl = getStreamUrl(movie.movieFile.path, config);
      onPlayStream(streamUrl, movie.title);
    }
  };

  const renderActions = () => {
    if (!isPlayable) {
      if (queueItem) {
        let progress = 0;
        if (queueItem.size > 0) {
          progress = Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100);
        }
        const downloaded = queueItem.size - queueItem.sizeleft;
        const sizeStr = queueItem.size > 0 ? `${formatSize(downloaded)} / ${formatSize(queueItem.size)}` : '';

        return (
          <div className="modal-download-section modal-download-section--server">
            <div className="modal-dl-header">
              <div className="modal-dl-status">
                <span className="modal-dl-title">Téléchargement sur le serveur</span>
                <span className="modal-dl-percentage modal-dl-percentage--server">{progress}%</span>
              </div>
              {onCancelServerQueue && (queueItem.id !== undefined || queueItem.movieId !== undefined) && (
                <div className="modal-dl-actions">
                  <IconButton
                    icon={<X size={16} />}
                    variant="danger"
                    size="sm"
                    onClick={() => setShowCancelServerQueueConfirm(true)}
                    title="Annuler le téléchargement sur le serveur"
                    aria-label="Annuler le téléchargement sur le serveur"
                  />
                </div>
              )}
            </div>
            <div className="modal-dl-progress">
              <ProgressBar value={progress} variant="server" size="md" />
            </div>
            <div className="modal-dl-stats">
              {sizeStr && <span>{sizeStr}</span>}
              {sizeStr && queueItem.timeleft && <span className="dl-separator">•</span>}
              {queueItem.timeleft && <span>Temps restant : {queueItem.timeleft}</span>}
            </div>
          </div>
        );
      }

      return (
        <div className="modal-actions">
          <p className="unavailable-text">
            Ce film n'est pas encore disponible sur le serveur. En attente de téléchargement.
          </p>
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

    return (
      <div className="modal-actions-wrapper">
        <div className="modal-actions">
          <Button
            variant="primary"
            size="lg"
            leftIcon={<Play size={20} fill="currentColor" />}
            onClick={handlePlayMovie}
          >
            Lancer le film
          </Button>

          {!isLocalMovie && !isDownloading && !isPaused && (
            <Button
              variant="secondary"
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
            title={isLocalMovie ? 'Supprimer du disque local' : 'Supprimer du serveur'}
            aria-label={isLocalMovie ? 'Supprimer du disque local' : 'Supprimer du serveur'}
          />
        </div>

        {(isDownloading || isPaused) && (
          <div className="modal-download-section">
            <div className="modal-dl-header">
              <div className="modal-dl-status">
                <span className="modal-dl-title">
                  {isPaused ? 'Téléchargement en pause' : 'Téléchargement local'}
                </span>
                <span className="modal-dl-percentage">{download?.progress || 0}%</span>
              </div>
              <div className="modal-dl-actions">
                {isDownloading && (
                  <IconButton
                    icon={<Pause size={16} fill="currentColor" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancelDownload(`movie-${movie.id}`)}
                    title="Mettre en pause"
                    aria-label="Mettre en pause"
                  />
                )}
                {isPaused && (
                  <IconButton
                    icon={<Play size={16} fill="currentColor" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownload(movie)}
                    title="Reprendre"
                    aria-label="Reprendre le téléchargement"
                  />
                )}
                <IconButton
                  icon={<X size={16} />}
                  variant="danger"
                  size="sm"
                  onClick={() => setShowCancelDownloadConfirm(true)}
                  title="Annuler le téléchargement"
                  aria-label="Annuler le téléchargement"
                />
              </div>
            </div>

            <div className="modal-dl-progress">
              <ProgressBar
                value={download?.progress || 0}
                isPaused={isPaused}
                size="md"
              />
            </div>

            <div className="modal-dl-stats">
              <span>{download?.sizeStr || download?.stats}</span>
              {isDownloading && download?.speed && <span className="dl-separator">•</span>}
              {isDownloading && download?.speed && <span>{download.speed}</span>}
              {isDownloading && download?.timeRemaining && <span className="dl-separator">•</span>}
              {isDownloading && download?.timeRemaining && <span>Reste {download.timeRemaining}</span>}
              {isPaused && <span className="dl-separator">•</span>}
              {isPaused && <span className="dl-paused-label">En pause</span>}
            </div>
          </div>
        )}
      </div>
    );
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
          <div className="modal-meta-row">
            <span className="movie-runtime">{movie.year}</span>
            {movie.runtime ? (
              <>
                <span className="meta-dot">•</span>
                <span className="movie-runtime">{formatDuration(movie.runtime)}</span>
              </>
            ) : null}
            {movie.movieFile && (
              <>
                <span className="meta-dot">•</span>
                <span className="file-size-info">{formatSize(movie.movieFile.size)}</span>
              </>
            )}
          </div>

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
            const ext = movie.movieFile?.path.split('.').pop() || 'mkv';
            const filename = `${movie.title} (${movie.year}).${ext}`;
            onDeleteDownload(`movie-${movie.id}`, true, filename);
          } else {
            onDeleteServerMovie(movie.id);
          }
          onClose();
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelDownloadConfirm}
        title="Annuler le téléchargement"
        message={
          <>
            Voulez-vous vraiment annuler le téléchargement de <strong>{movie.title} ({movie.year})</strong>&nbsp;?
          </>
        }
        confirmLabel="Annuler le téléchargement"
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          setShowCancelDownloadConfirm(false);
          const ext = movie.movieFile?.path.split('.').pop() || 'mkv';
          const filename = `${movie.title} (${movie.year}).${ext}`;
          onDeleteDownload(`movie-${movie.id}`, true, filename);
        }}
        onClose={() => setShowCancelDownloadConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelServerQueueConfirm}
        title="Annuler le téléchargement sur le serveur"
        message={
          <>
            Voulez-vous vraiment annuler le téléchargement de <strong>{movie.title} ({movie.year})</strong> sur le serveur&nbsp;?
          </>
        }
        confirmLabel="Annuler le téléchargement"
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          setShowCancelServerQueueConfirm(false);
          if (onCancelServerQueue && (queueItem?.id !== undefined || queueItem?.movieId !== undefined)) {
            onCancelServerQueue((queueItem.id ?? queueItem.movieId)!);
          }
        }}
        onClose={() => setShowCancelServerQueueConfirm(false)}
      />
    </>
  );
}

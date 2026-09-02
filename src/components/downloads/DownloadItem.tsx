import { useState } from 'react';
import { DownloadInfo, Movie } from '../../types';
import { Play, Pause, Trash2 } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '../ui';
import { ConfirmModal } from '../common/ConfirmModal';

interface DownloadItemProps {
  download: DownloadInfo;
  movie?: Movie;
  onSelectMovie?: (movie: Movie) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onPlay: (path: string) => void;
  onDelete: (id: number, deleteFromDisk: boolean) => void;
}

export function DownloadItem({
  download,
  movie,
  onSelectMovie,
  onPause,
  onResume,
  onPlay,
  onDelete,
}: DownloadItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isCompleted = download.status === 'completed';
  const isDownloading = download.status === 'downloading';
  const isPaused = download.status === 'paused';

  const handleItemClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.dl-actions')) return;
    if (movie && onSelectMovie) {
      onSelectMovie(movie);
    }
  };

  return (
    <>
      <div
        className="download-item"
        style={{ cursor: movie && onSelectMovie ? 'pointer' : 'default' }}
        onClick={handleItemClick}
        title={movie && onSelectMovie ? 'Cliquer pour voir les détails' : undefined}
      >
        <div className="dl-info">
          <h4 title={download.title}>{download.title}</h4>
          {isCompleted ? (
            <span className="dl-stats dl-stats--completed">
              <span>{download.stats || 'Sur le disque'}</span>
            </span>
          ) : (
            <span className="dl-stats">
              <span>{download.sizeStr || download.stats}</span>
              {isDownloading && download.speed && <span className="dl-separator">•</span>}
              {isDownloading && download.speed && <span>{download.speed}</span>}
            </span>
          )}
        </div>

        <div className="dl-center">
          {!isCompleted && (
            <ProgressBar
              value={download.progress}
              isPaused={isPaused}
              size="md"
            />
          )}
        </div>

        <div className="dl-actions">
          {!isCompleted && (
            <span className="dl-percentage dl-percentage--local">
              {download.progress}%
            </span>
          )}

          {isDownloading && (
            <IconButton
              icon={<Pause size={16} fill="currentColor" />}
              variant="secondary"
              size="sm"
              onClick={() => onPause(download.id)}
              title="Pause"
              aria-label="Mettre en pause"
            />
          )}

          {isPaused && (
            <IconButton
              icon={<Play size={16} fill="currentColor" />}
              variant="secondary"
              size="sm"
              onClick={() => onResume(download.id)}
              title="Reprendre"
              aria-label="Reprendre le téléchargement"
            />
          )}

          {isCompleted && download.path && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Play size={16} fill="currentColor" />}
              onClick={() => onPlay(download.path!)}
            >
              Lancer
            </Button>
          )}

          <IconButton
            icon={<Trash2 size={16} />}
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            title={isCompleted ? 'Supprimer' : 'Annuler'}
            aria-label={isCompleted ? 'Supprimer le téléchargement' : 'Annuler le téléchargement'}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={isCompleted ? 'Supprimer le téléchargement' : 'Annuler le téléchargement'}
        message={
          isCompleted ? (
            <>
              Voulez-vous vraiment supprimer <strong>{download.title}</strong> de vos téléchargements locaux&nbsp;?
              Le fichier vidéo sera définitivement effacé de votre disque.
            </>
          ) : (
            <>
              Voulez-vous vraiment annuler le téléchargement de <strong>{download.title}</strong>&nbsp;?
            </>
          )
        }
        confirmLabel={isCompleted ? 'Supprimer le fichier' : 'Annuler le téléchargement'}
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(download.id, isCompleted);
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

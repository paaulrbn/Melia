import { DownloadInfo } from '../../types';
import { PlayIcon, PauseIcon, TrashIcon } from '../common/Icons';

interface DownloadItemProps {
  download: DownloadInfo;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onPlay: (path: string) => void;
  onDelete: (id: number, deleteFromDisk: boolean) => void;
}

export function DownloadItem({
  download,
  onPause,
  onResume,
  onPlay,
  onDelete,
}: DownloadItemProps) {
  const isCompleted = download.status === 'completed';
  const isDownloading = download.status === 'downloading';
  const isPaused = download.status === 'paused';

  return (
    <div className="download-item">
      <div className="dl-info">
        <h4>{download.title}</h4>
        {!isCompleted && (
          <span className="dl-stats">
            <span>{download.sizeStr || download.stats}</span>
            {isDownloading && download.speed && <span className="dl-separator">•</span>}
            {isDownloading && download.speed && <span>{download.speed}</span>}
          </span>
        )}
      </div>

      <div className="dl-center">
        {!isCompleted && (
          <div className="progress-container">
            <div
              className={`progress-bar ${isPaused ? 'paused' : ''}`}
              style={{ width: `${download.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="dl-actions">
        {isDownloading && (
          <button
            className="btn-cancel-small btn-icon"
            onClick={() => onPause(download.id)}
            title="Pause"
            aria-label="Mettre en pause"
          >
            <PauseIcon size={18} />
          </button>
        )}

        {isPaused && (
          <button
            className="btn-resume-small btn-icon"
            onClick={() => onResume(download.id)}
            title="Reprendre"
            aria-label="Reprendre le téléchargement"
          >
            <PlayIcon size={18} />
          </button>
        )}

        {isCompleted && download.path && (
          <button
            className="btn-play-small"
            style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={() => onPlay(download.path!)}
          >
            <PlayIcon size={16} />
            Lancer
          </button>
        )}

        <button
          className="btn-cancel-small btn-icon"
          onClick={() => onDelete(download.id, isCompleted)}
          title={isCompleted ? 'Supprimer' : 'Annuler'}
          aria-label={isCompleted ? 'Supprimer le téléchargement' : 'Annuler le téléchargement'}
        >
          <TrashIcon size={18} />
        </button>
      </div>
    </div>
  );
}

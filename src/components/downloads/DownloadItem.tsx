import { useState } from 'react';
import { DownloadInfo, Movie, Series } from '../../types';
import { Film, Play, Pause, Trash2, X } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '../ui';
import { ConfirmModal } from '../common/ConfirmModal';
import { getImageUrl } from '../../utils/media';

interface DownloadItemProps {
  readonly download: DownloadInfo;
  readonly movie?: Movie;
  readonly series?: Series;
  readonly onSelectMovie?: (movie: Movie) => void;
  readonly onSelectSeries?: (series: Series) => void;
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly onPlay: (path: string, title?: string) => void;
  readonly onDelete: (id: string, deleteFromDisk: boolean) => void;
}

function getMediaPosterUrl(movie?: Movie, series?: Series): string | null {
  if (movie) return getImageUrl(movie, 'poster');
  if (series) return getImageUrl(series, 'poster');
  return null;
}

interface ItemActionsProps {
  readonly isCompleted: boolean;
  readonly isDownloading: boolean;
  readonly isPaused: boolean;
  readonly download: DownloadInfo;
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly onPlay: (path: string, title?: string) => void;
  readonly onOpenDelete: () => void;
}

function DownloadItemActions({
  isCompleted,
  isDownloading,
  isPaused,
  download,
  onPause,
  onResume,
  onPlay,
  onOpenDelete,
}: Readonly<ItemActionsProps>) {
  return (
    <div className="dl-actions">
      {!isCompleted && (
        <span className="dl-percentage dl-percentage--local">
          {download.progress}%
        </span>
      )}

      {isDownloading && (
        <IconButton
          icon={<Pause size={16} fill="currentColor" />}
          variant="ghost"
          size="sm"
          onClick={() => onPause(download.id)}
          title="Pause"
          aria-label="Mettre en pause"
        />
      )}

      {isPaused && (
        <IconButton
          icon={<Play size={16} fill="currentColor" />}
          variant="ghost"
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
          onClick={() => onPlay(download.path!, download.title)}
        >
          Lancer
        </Button>
      )}

      <IconButton
        icon={isCompleted ? <Trash2 size={16} /> : <X size={16} />}
        variant="danger"
        size="sm"
        onClick={onOpenDelete}
        title={isCompleted ? 'Supprimer' : 'Annuler'}
        aria-label={isCompleted ? 'Supprimer le téléchargement' : 'Annuler le téléchargement'}
      />
    </div>
  );
}

function DownloadItemMeta({
  isCompleted,
  isDownloading,
  isPaused,
  download,
}: Readonly<{
  isCompleted: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  download: DownloadInfo;
}>) {
  if (isCompleted) {
    return (
      <div className="dl-meta-row">
        <span className="dl-stats dl-stats--completed">
          <span>{download.stats || 'Sur le disque'}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="dl-meta-row">
      <span className="dl-stats">
        <span>{download.sizeStr || download.stats}</span>
        {isDownloading && download.speed && <span className="dl-separator">•</span>}
        {isDownloading && download.speed && <span>{download.speed}</span>}
        {isDownloading && download.timeRemaining && <span className="dl-separator">•</span>}
        {isDownloading && download.timeRemaining && <span>Reste {download.timeRemaining}</span>}
        {isPaused && <span className="dl-separator">•</span>}
        {isPaused && <span className="dl-paused-label">En pause</span>}
      </span>
    </div>
  );
}

export function DownloadItem({
  download,
  movie,
  series,
  onSelectMovie,
  onSelectSeries,
  onPause,
  onResume,
  onPlay,
  onDelete,
}: Readonly<DownloadItemProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isCompleted = download.status === 'completed';
  const isDownloading = download.status === 'downloading';
  const isPaused = download.status === 'paused';

  const isClickable = !!((movie && onSelectMovie) || (series && onSelectSeries));
  const posterUrl = getMediaPosterUrl(movie, series);

  const triggerSelect = () => {
    if (movie && onSelectMovie) {
      onSelectMovie(movie);
    } else if (series && onSelectSeries) {
      onSelectSeries(series);
    }
  };

  const displaySubTitle = download.subTitle ? ` (${download.subTitle})` : '';

  const renderPoster = () => {
    const posterContent = posterUrl ? (
      <img src={posterUrl} alt="" className="dl-poster" />
    ) : (
      <div className="dl-poster dl-poster--placeholder">
        <Film size={18} />
      </div>
    );

    if (isClickable) {
      return (
        <button
          type="button"
          className="dl-poster-btn"
          onClick={triggerSelect}
          title="Cliquer pour voir les détails"
        >
          {posterContent}
        </button>
      );
    }

    return posterContent;
  };

  const renderTitle = () => {
    const titleContent = (
      <h4 title={download.title}>
        {download.title}
        {download.subTitle && <span className="dl-subtitle"> — {download.subTitle}</span>}
      </h4>
    );

    if (isClickable) {
      return (
        <button
          type="button"
          className="dl-title-btn"
          onClick={triggerSelect}
          title="Cliquer pour voir les détails"
        >
          {titleContent}
        </button>
      );
    }

    return titleContent;
  };

  return (
    <>
      <div className={`download-item ${isClickable ? 'is-clickable' : ''}`.trim()}>
        {renderPoster()}

        <div className="dl-main">
          <div className="dl-header-row">
            {renderTitle()}

            <DownloadItemActions
              isCompleted={isCompleted}
              isDownloading={isDownloading}
              isPaused={isPaused}
              download={download}
              onPause={onPause}
              onResume={onResume}
              onPlay={onPlay}
              onOpenDelete={() => setShowDeleteConfirm(true)}
            />
          </div>

          {!isCompleted && (
            <div className="dl-progress-row">
              <ProgressBar
                value={download.progress}
                isPaused={isPaused}
                size="md"
              />
            </div>
          )}

          <DownloadItemMeta
            isCompleted={isCompleted}
            isDownloading={isDownloading}
            isPaused={isPaused}
            download={download}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={isCompleted ? 'Supprimer le téléchargement' : 'Annuler le téléchargement'}
        message={
          isCompleted ? (
            <>
              Voulez-vous vraiment supprimer <strong>{download.title}{displaySubTitle}</strong> de vos téléchargements locaux&nbsp;?
              Le fichier vidéo sera définitivement effacé de votre disque.
            </>
          ) : (
            <>
              Voulez-vous vraiment annuler le téléchargement de <strong>{download.title}{displaySubTitle}</strong>&nbsp;?
            </>
          )
        }
        confirmLabel={isCompleted ? 'Supprimer le fichier' : 'Annuler le téléchargement'}
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(download.id, true);
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

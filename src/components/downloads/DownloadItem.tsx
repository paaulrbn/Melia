import { useState } from 'react';
import { Pause, Play, Trash2, X } from 'lucide-react';
import { DownloadInfo, Movie, Series } from '../../types';
import { Button } from '../ui';
import { ConfirmModal } from '../common/ConfirmModal';
import { getImageUrl } from '../../utils/media';
import { DownloadAction, DownloadRow, DownloadThumb } from './DownloadRow';
import { describeLocalDownload } from './transferDetails';

interface DownloadItemProps {
  readonly download: DownloadInfo;
  readonly movie?: Movie;
  readonly series?: Series;
  /** `trigger`: the row, which takes the focus back when the movie page closes */
  readonly onSelectMovie?: (movie: Movie, trigger?: HTMLElement) => void;
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

/** A movie (or a lone episode) on this computer: in progress, paused, interrupted or ready. */
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
  const canResume = download.status === 'paused' || download.status === 'error';
  const view = describeLocalDownload(download);

  const title = download.subTitle ? `${download.title}, ${download.subTitle}` : download.title;
  const displaySubTitle = download.subTitle ? ` (${download.subTitle})` : '';

  let onOpen: ((trigger: HTMLElement) => void) | undefined;
  if (movie && onSelectMovie) onOpen = trigger => onSelectMovie(movie, trigger);
  else if (series && onSelectSeries) onOpen = () => onSelectSeries(series);

  const actions = isCompleted ? (
    <>
      {download.path && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Play size={14} fill="currentColor" aria-hidden="true" />}
          onClick={() => onPlay(download.path!, download.title)}
          aria-label={`Lancer ${title}`}
        >
          Lancer
        </Button>
      )}
      <DownloadAction
        label="Supprimer de cet ordinateur"
        icon={<Trash2 size={16} aria-hidden="true" />}
        onClick={() => setShowDeleteConfirm(true)}
        destructive
      />
    </>
  ) : (
    <>
      {isDownloading && (
        <DownloadAction
          label="Mettre en pause"
          icon={<Pause size={16} aria-hidden="true" />}
          onClick={() => onPause(download.id)}
        />
      )}
      {canResume && (
        <DownloadAction
          label="Reprendre le téléchargement"
          icon={<Play size={16} aria-hidden="true" />}
          onClick={() => onResume(download.id)}
        />
      )}
      <DownloadAction
        label="Annuler le téléchargement"
        icon={<X size={16} aria-hidden="true" />}
        onClick={() => setShowDeleteConfirm(true)}
        destructive
      />
    </>
  );

  return (
    <>
      <DownloadRow
        title={title}
        status={view.status}
        details={view.figures}
        progress={view.progress}
        state={view.state}
        leading={<DownloadThumb src={getMediaPosterUrl(movie, series)} kind={series && !movie ? 'series' : 'movie'} />}
        actions={actions}
        onOpen={onOpen}
        openLabel={movie ? 'Voir la fiche du film' : 'Voir la fiche de la série'}
        movieId={onOpen ? movie?.id : undefined}
      />

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

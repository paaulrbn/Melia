import { useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Search,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import { Config, DownloadInfo, Movie, QualityProfile, QueueRecord } from '../../types';
import { useMovieDirectors } from '../../hooks/useMovieDirectors';
import { formatNameList } from '../../utils/credits';
import { formatDuration, formatSize } from '../../utils/formatters';
import { getImageUrl, getStreamUrl } from '../../utils/media';
import { describeUpcomingRelease, isMovieUpcoming } from '../../utils/release';
import { formatTimeLeft, parseLocalTimeLeft, parseQueueTimeLeft } from '../../utils/transfer';
import { ConfirmModal } from '../common/ConfirmModal';
import { MovieDetailLayout, QualityPicker, TransferStatus } from './MovieDetailLayout';

interface MovieDetailViewProps {
  readonly movie: Movie;
  readonly download?: DownloadInfo;
  readonly queueItem?: QueueRecord;
  readonly movieStatus: 'local' | 'server' | 'unavailable';
  readonly config: Config;
  /** Status banners of the movies screen (server unreachable, failed action). */
  readonly notices?: ReactNode;
  /** Back to the movies list (after a deletion); the top row carries the back button. */
  readonly onBack: () => void;
  readonly onDownload: (movie: Movie) => void;
  readonly onCancelDownload: (id: string) => void;
  readonly onPlay: (pathOrUrl: string, title?: string) => void;
  readonly onDeleteDownload: (id: string, deleteFromDisk: boolean, fallbackFilename?: string) => void;
  readonly onDeleteServerMovie: (movieId: number) => void;
  readonly onCancelServerQueue: (queueId: number) => void;
  readonly qualityProfiles: QualityProfile[];
  readonly onChangeQuality: (movieId: number, qualityProfileId: number) => Promise<boolean>;
  /** Added from the search a moment ago: the server is still looking for a release. */
  readonly isJustAdded?: boolean;
}

function localFilename(movie: Movie): string {
  const ext = movie.movieFile?.path.split('.').pop() || 'mkv';
  return `${movie.title} (${movie.year}).${ext}`;
}

/**
 * Page of a library movie (layout in MovieDetailLayout). The backdrop header holds
 * everything needed at a glance: poster, title, director, key facts and the main action
 * (play, or what stands in for it: server progress, release date, quality and new
 * search). The summary follows below.
 */
export function MovieDetailView({
  movie,
  download,
  queueItem,
  movieStatus,
  config,
  notices,
  onBack,
  onDownload,
  onCancelDownload,
  onPlay,
  onDeleteDownload,
  onDeleteServerMovie,
  onCancelServerQueue,
  qualityProfiles,
  onChangeQuality,
  isJustAdded = false,
}: Readonly<MovieDetailViewProps>) {
  const [qualityOverride, setQualityOverride] = useState<number | null>(null);
  const [isSearchingQuality, setIsSearchingQuality] = useState(false);
  const [qualitySearchOk, setQualitySearchOk] = useState<boolean | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelDownloadConfirm, setShowCancelDownloadConfirm] = useState(false);
  const [showCancelServerQueueConfirm, setShowCancelServerQueueConfirm] = useState(false);

  const isLocalMovie = movieStatus === 'local' || (download?.status === 'completed' && !!download.path);
  const isServerAvailable = movie.hasFile && !!movie.movieFile;
  const isPlayable = isLocalMovie || isServerAvailable;
  const isDownloading = download?.status === 'downloading';
  const isPaused = download?.status === 'paused';
  const isFailed = download?.status === 'error';
  const fanartUrl = getImageUrl(movie, 'fanart');
  const posterUrl = getImageUrl(movie, 'poster');
  const directors = useMovieDirectors(movie.id);
  const queueId = queueItem?.id ?? queueItem?.movieId;
  const deleteLabel = isLocalMovie ? 'Supprimer du disque local' : 'Supprimer du serveur';

  const handlePlayMovie = () => {
    if (isLocalMovie && download?.path) {
      onPlay(download.path, movie.title);
    } else if (movie.movieFile?.path) {
      onPlay(getStreamUrl(movie.movieFile.path, config), movie.title);
    }
  };

  // Secondary and destructive: same quiet size as the other side actions
  const deleteButton = (
    <button
      type="button"
      className="movie-detail-quiet movie-detail-quiet--icon movie-detail-quiet--danger"
      onClick={() => setShowDeleteConfirm(true)}
      title={deleteLabel}
      aria-label={deleteLabel}
    >
      <Trash2 size={18} aria-hidden="true" />
    </button>
  );

  // Round glass button of the delete button's family (pause, resume, cancel)
  const roundButton = (label: string, icon: ReactNode, onClick: () => void, danger = false) => (
    <button
      type="button"
      className={`movie-detail-quiet movie-detail-quiet--icon${danger ? ' movie-detail-quiet--danger' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );

  const renderServerQueue = (item: QueueRecord) => {
    const downloaded = Math.max(0, item.size - item.sizeleft);
    // Nothing received yet: "En attente" and a sober moving bar, not an empty one
    const hasStarted = item.size > 0 && downloaded > 0;
    const details = hasStarted
      ? [
          `${formatSize(downloaded)} sur ${formatSize(item.size)}`,
          formatTimeLeft(parseQueueTimeLeft(item.timeleft)),
        ].filter(Boolean)
      : ['En attente'];

    return (
      <TransferStatus
        id="movie-detail-queue"
        title="Téléchargement sur le serveur"
        details={details}
        progress={hasStarted ? (downloaded / item.size) * 100 : null}
        actions={
          queueId !== undefined &&
          roundButton(
            'Annuler le téléchargement sur le serveur',
            <X size={18} aria-hidden="true" />,
            () => setShowCancelServerQueueConfirm(true),
            true
          )
        }
      />
    );
  };

  const renderMissing = () => {
    const selectedQualityId = qualityOverride ?? movie.qualityProfileId;
    const isUpcoming = isMovieUpcoming(movie);

    const handleSearchWithQuality = async () => {
      if (!selectedQualityId) return;
      setIsSearchingQuality(true);
      setQualitySearchOk(null);
      const ok = await onChangeQuality(movie.id, selectedQualityId);
      setQualitySearchOk(ok);
      setIsSearchingQuality(false);
    };

    let qualityStatus = '';
    if (qualitySearchOk === true) qualityStatus = 'Recherche lancée sur Radarr';
    else if (qualitySearchOk === false) qualityStatus = 'Échec de la modification';

    // Just added: the server search has only started, "not found" would be premature
    let stateIcon = <SearchX className="movie-detail-state-icon" size={20} aria-hidden="true" />;
    let stateTitle = 'Introuvable dans cette qualité';
    let stateDetail =
      'Aucune version de ce film n’a été trouvée pour cette qualité. Essayez-en une autre et relancez la recherche.';
    if (isUpcoming) {
      stateIcon = <CalendarClock className="movie-detail-state-icon" size={20} aria-hidden="true" />;
      stateTitle = describeUpcomingRelease(movie);
      stateDetail = 'Il sera téléchargé sur le serveur dès sa sortie.';
    } else if (isJustAdded) {
      stateIcon = <Search className="movie-detail-state-icon" size={20} aria-hidden="true" />;
      stateTitle = 'Recherche en cours sur le serveur';
      stateDetail = 'Le film a été ajouté. Son téléchargement sur le serveur commencera dès qu’une version sera trouvée.';
    }

    return (
      <div className="movie-detail-missing">
        <div className="movie-detail-state">
          {stateIcon}
          <div className="movie-detail-state-text">
            <p className="movie-detail-state-title">{stateTitle}</p>
            <p className="movie-detail-state-detail">{stateDetail}</p>
          </div>
        </div>

        {/* One row: main action, quality, then the destructive action at the end */}
        <div className="movie-detail-actions">
          {qualityProfiles.length > 0 && (
            <>
              <button
                type="button"
                className="movie-detail-search"
                onClick={handleSearchWithQuality}
                disabled={isSearchingQuality || !selectedQualityId}
                aria-busy={isSearchingQuality}
              >
                {isSearchingQuality ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw size={18} aria-hidden="true" />
                )}
                Relancer la recherche
              </button>
              <QualityPicker
                profiles={qualityProfiles}
                value={selectedQualityId}
                onChange={setQualityOverride}
                disabled={isSearchingQuality}
              />
            </>
          )}
          {deleteButton}
        </div>

        {/* Always in the DOM so the result is announced when it appears */}
        <p
          className={`movie-detail-status${qualitySearchOk === false ? ' movie-detail-status--error' : ''}`}
          role="status"
        >
          {qualityStatus}
        </p>
      </div>
    );
  };

  const renderLocalDownload = (info: DownloadInfo) => {
    const sizes = info.sizeStr ? info.sizeStr.replace(' / ', ' sur ') : '';
    // Just started, no figure yet: a moving bar instead of an empty one
    const isStarting = isDownloading && !sizes && !info.progress;

    let title = 'Téléchargement sur cet ordinateur';
    let state: 'active' | 'paused' | 'error' = 'active';
    if (isPaused) {
      title = 'Téléchargement en pause';
      state = 'paused';
    } else if (isFailed) {
      title = 'Téléchargement interrompu';
      state = 'error';
    }

    let details: string[];
    if (isStarting) {
      details = ['Démarrage'];
    } else if (isDownloading) {
      details = [
        sizes,
        info.speed ?? '',
        formatTimeLeft(parseLocalTimeLeft(info.timeRemaining)),
      ].filter(Boolean);
    } else {
      details = sizes ? [sizes] : [];
    }

    return (
      <TransferStatus
        id="movie-detail-download"
        title={title}
        details={details}
        progress={isStarting ? null : info.progress || 0}
        state={state}
        actions={
          <>
            {isDownloading &&
              roundButton('Mettre en pause', <Pause size={18} aria-hidden="true" />, () =>
                onCancelDownload(`movie-${movie.id}`)
              )}
            {(isPaused || isFailed) &&
              roundButton('Reprendre le téléchargement', <Play size={18} aria-hidden="true" />, () =>
                onDownload(movie)
              )}
            {roundButton(
              'Annuler le téléchargement',
              <X size={18} aria-hidden="true" />,
              () => setShowCancelDownloadConfirm(true),
              true
            )}
          </>
        }
      />
    );
  };

  const renderPlayable = () => (
    <>
      <div className="movie-detail-actions">
        <button type="button" className="movie-detail-play" onClick={handlePlayMovie}>
          <Play className="movie-detail-play-icon" size={22} fill="currentColor" aria-hidden="true" />
          Lancer le film
        </button>
        {!isLocalMovie && !isDownloading && !isPaused && !isFailed && (
          <button type="button" className="movie-detail-quiet" onClick={() => onDownload(movie)}>
            <Download size={18} aria-hidden="true" />
            Télécharger
          </button>
        )}
        {deleteButton}
      </div>
      {download && (isDownloading || isPaused || isFailed) && renderLocalDownload(download)}
    </>
  );

  const renderPrimary = () => {
    if (isPlayable) return renderPlayable();
    if (queueItem) return renderServerQueue(queueItem);
    return renderMissing();
  };

  return (
    <MovieDetailLayout
      title={movie.title}
      fanartUrl={fanartUrl}
      posterUrl={posterUrl}
      credit={
        directors.length > 0 ? (
          <>
            {/* The name alone on screen, with its meaning for screen readers */}
            <span className="sr-only">Réalisé par </span>
            {formatNameList(directors)}
          </>
        ) : undefined
      }
      facts={
        <>
          {movie.year > 0 && <li>{movie.year}</li>}
          {movie.runtime ? <li>{formatDuration(movie.runtime)}</li> : null}
          {movie.movieFile && <li>{formatSize(movie.movieFile.size)}</li>}
        </>
      }
      primary={renderPrimary()}
      notices={notices}
      overview={movie.overview}
    >
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
            onDeleteDownload(`movie-${movie.id}`, true, localFilename(movie));
          } else {
            onDeleteServerMovie(movie.id);
          }
          onBack();
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
          onDeleteDownload(`movie-${movie.id}`, true, localFilename(movie));
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
          if (queueId !== undefined) onCancelServerQueue(queueId);
        }}
        onClose={() => setShowCancelServerQueueConfirm(false)}
      />
    </MovieDetailLayout>
  );
}

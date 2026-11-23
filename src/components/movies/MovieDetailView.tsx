import { useState, type ReactNode } from 'react';
import {
  CalendarClock,
  CloudDownload,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCw,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import { Config, DownloadInfo, Movie, QualityProfile, QueueRecord } from '../../types';
import { formatDuration, formatSize } from '../../utils/formatters';
import { getImageUrl, getStreamUrl } from '../../utils/media';
import { describeUpcomingRelease, isMovieUpcoming } from '../../utils/release';
import { ConfirmModal } from '../common/ConfirmModal';
import { IconButton, ProgressBar, Select } from '../ui';

/** Heading of the detail page: it takes the focus when the page opens. */
export const MOVIE_DETAIL_HEADING_ID = 'movie-detail-title';

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
}

function localFilename(movie: Movie): string {
  const ext = movie.movieFile?.path.split('.').pop() || 'mkv';
  return `${movie.title} (${movie.year}).${ext}`;
}

/**
 * Movie page, shown in the content area in place of the list. The backdrop header holds
 * everything needed at a glance: poster, title, key facts and the main action (play, or
 * what stands in for it: server progress, release date, quality and new search). The
 * summary follows below.
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
  const fanartUrl = getImageUrl(movie, 'fanart');
  const posterUrl = getImageUrl(movie, 'poster');
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

  const renderServerQueue = (item: QueueRecord) => {
    const progress = item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
    const sizeStr =
      item.size > 0 ? `${formatSize(item.size - item.sizeleft)} / ${formatSize(item.size)}` : '';

    return (
      <section className="movie-detail-panel" aria-labelledby="movie-detail-queue-title">
        <div className="movie-detail-panel-header">
          <CloudDownload className="movie-detail-panel-icon movie-detail-panel-icon--server" size={18} aria-hidden="true" />
          <h3 className="movie-detail-panel-title" id="movie-detail-queue-title">
            Téléchargement sur le serveur
          </h3>
          <span className="movie-detail-panel-value movie-detail-panel-value--server">{progress}&nbsp;%</span>
          {queueId !== undefined && (
            <IconButton
              icon={<X size={16} aria-hidden="true" />}
              variant="danger"
              size="sm"
              className="movie-detail-panel-action"
              onClick={() => setShowCancelServerQueueConfirm(true)}
              title="Annuler le téléchargement sur le serveur"
              aria-label="Annuler le téléchargement sur le serveur"
            />
          )}
        </div>
        <ProgressBar value={progress} variant="server" size="md" />
        {(sizeStr || item.timeleft) && (
          <p className="movie-detail-panel-stats">
            {sizeStr && <span>{sizeStr}</span>}
            {item.timeleft && <span>Temps restant&nbsp;: {item.timeleft}</span>}
          </p>
        )}
        <p className="movie-detail-panel-note">Le film pourra être lancé dès la fin du téléchargement.</p>
      </section>
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

    return (
      <div className="movie-detail-missing">
        <div className="movie-detail-state">
          {isUpcoming ? (
            <CalendarClock className="movie-detail-state-icon" size={20} aria-hidden="true" />
          ) : (
            <SearchX className="movie-detail-state-icon" size={20} aria-hidden="true" />
          )}
          <div className="movie-detail-state-text">
            <p className="movie-detail-state-title">
              {isUpcoming ? describeUpcomingRelease(movie) : 'Introuvable dans cette qualité'}
            </p>
            <p className="movie-detail-state-detail">
              {isUpcoming
                ? 'Il sera téléchargé sur le serveur dès sa sortie.'
                : 'Aucune version de ce film n’a été trouvée pour cette qualité. Essayez-en une autre et relancez la recherche.'}
            </p>
          </div>
        </div>

        <div className="movie-detail-actions movie-detail-actions--quality">
          {qualityProfiles.length > 0 && (
            <>
              <Select
                label="Qualité"
                value={selectedQualityId ?? ''}
                onChange={e => setQualityOverride(Number(e.target.value))}
                options={qualityProfiles.map(qp => ({ value: qp.id, label: qp.name }))}
                disabled={isSearchingQuality}
                containerClassName="movie-detail-quality"
              />
              <button
                type="button"
                className="movie-detail-search"
                onClick={handleSearchWithQuality}
                disabled={isSearchingQuality || !selectedQualityId}
              >
                {isSearchingQuality ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw size={18} aria-hidden="true" />
                )}
                Relancer la recherche
              </button>
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

  const renderLocalDownload = () => {
    const progress = download?.progress || 0;
    return (
      <section className="movie-detail-panel" aria-labelledby="movie-detail-download-title">
        <div className="movie-detail-panel-header">
          <Download className="movie-detail-panel-icon" size={18} aria-hidden="true" />
          <h3 className="movie-detail-panel-title" id="movie-detail-download-title">
            {isPaused ? 'Téléchargement en pause' : 'Téléchargement sur cet ordinateur'}
          </h3>
          <span className="movie-detail-panel-value">{progress}&nbsp;%</span>
          <div className="movie-detail-panel-actions">
            {isDownloading && (
              <IconButton
                icon={<Pause size={16} fill="currentColor" aria-hidden="true" />}
                variant="ghost"
                size="sm"
                onClick={() => onCancelDownload(`movie-${movie.id}`)}
                title="Mettre en pause"
                aria-label="Mettre en pause"
              />
            )}
            {isPaused && (
              <IconButton
                icon={<Play size={16} fill="currentColor" aria-hidden="true" />}
                variant="ghost"
                size="sm"
                onClick={() => onDownload(movie)}
                title="Reprendre le téléchargement"
                aria-label="Reprendre le téléchargement"
              />
            )}
            <IconButton
              icon={<X size={16} aria-hidden="true" />}
              variant="danger"
              size="sm"
              onClick={() => setShowCancelDownloadConfirm(true)}
              title="Annuler le téléchargement"
              aria-label="Annuler le téléchargement"
            />
          </div>
        </div>
        <ProgressBar value={progress} isPaused={isPaused} size="md" />
        <p className="movie-detail-panel-stats">
          <span>{download?.sizeStr || download?.stats}</span>
          {isDownloading && download?.speed && <span>{download.speed}</span>}
          {isDownloading && download?.timeRemaining && <span>Reste {download.timeRemaining}</span>}
        </p>
      </section>
    );
  };

  const renderPlayable = () => (
    <>
      <div className="movie-detail-actions">
        <button type="button" className="movie-detail-play" onClick={handlePlayMovie}>
          <Play className="movie-detail-play-icon" size={22} fill="currentColor" aria-hidden="true" />
          Lancer le film
        </button>
        {!isLocalMovie && !isDownloading && !isPaused && (
          <button type="button" className="movie-detail-quiet" onClick={() => onDownload(movie)}>
            <Download size={18} aria-hidden="true" />
            Télécharger
          </button>
        )}
        {deleteButton}
      </div>
      {(isDownloading || isPaused) && renderLocalDownload()}
    </>
  );

  const renderPrimary = () => {
    if (isPlayable) return renderPlayable();
    if (queueItem) return renderServerQueue(queueItem);
    return renderMissing();
  };

  return (
    <article
      className={`movie-detail${posterUrl ? ' movie-detail--with-poster' : ''}`}
      aria-labelledby={MOVIE_DETAIL_HEADING_ID}
    >
      <header className="movie-detail-hero">
        {fanartUrl && (
          <div
            className="movie-detail-backdrop"
            style={{ backgroundImage: `url(${fanartUrl})` }}
            aria-hidden="true"
          />
        )}

        <div className="movie-detail-hero-inner">
          {posterUrl && <img className="movie-detail-poster" src={posterUrl} alt="" />}
          <div className="movie-detail-intro">
            <h2 className="movie-detail-title" id={MOVIE_DETAIL_HEADING_ID} tabIndex={-1}>
              {movie.title}
            </h2>
            <ul className="movie-detail-facts" aria-label="Informations">
              {movie.year > 0 && <li>{movie.year}</li>}
              {movie.runtime ? <li>{formatDuration(movie.runtime)}</li> : null}
              {movie.movieFile && <li>{formatSize(movie.movieFile.size)}</li>}
            </ul>
            <div className="movie-detail-primary">{renderPrimary()}</div>
          </div>
        </div>
      </header>

      <div className="movie-detail-body">
        {notices}
        <section className="movie-detail-section" aria-labelledby="movie-detail-overview-title">
          <h3 className="movie-detail-section-title" id="movie-detail-overview-title">
            Résumé
          </h3>
          <p className="movie-detail-overview">{movie.overview || 'Aucun résumé disponible.'}</p>
        </section>
      </div>

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
    </article>
  );
}

import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Play, Plus } from 'lucide-react';
import { ProgressBar } from '../ui';

interface MovieCardProps {
  readonly movie: Movie | LookupMovie;
  readonly download?: DownloadInfo;
  readonly queueItem?: QueueRecord;
  readonly isAddHint?: boolean;
  readonly onClick: () => void;
}

export function MovieCard({
  movie,
  download,
  queueItem,
  isAddHint = false,
  onClick,
}: Readonly<MovieCardProps>) {
  const posterUrl = getImageUrl(movie, 'poster');

  // Calculate Radarr queue progress if applicable
  let serverProgress = 0;
  if (queueItem && queueItem.size > 0) {
    serverProgress = Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100);
  }

  // Library movie monitored by Radarr but with no file, not downloading and not in the queue
  const isMissing =
    'hasFile' in movie &&
    !movie.hasFile &&
    movie.monitored !== false &&
    !queueItem &&
    !download;

  return (
    <button
      type="button"
      className="movie-card"
      onClick={onClick}
    >
      {posterUrl && <img src={posterUrl} alt={movie.title} loading="lazy" />}
      {isMissing && <span className="movie-missing-band" title="Film manquant sur le serveur" />}
      <div className="movie-overlay">
        <h3>{movie.title}</h3>
        <span className="year">{movie.year}</span>

        {isAddHint && (
          <div className="mini-status add-hint">
            <Plus size={13} />
            <span>Ajouter</span>
          </div>
        )}

        {(download?.status === 'downloading' || download?.status === 'paused') && (
          <ProgressBar
            value={download.progress}
            isPaused={download.status === 'paused'}
            size="xs"
            style={{ marginTop: '10px' }}
          />
        )}

        {download?.status === 'completed' && (
          <div className="mini-status">
            <Play size={12} fill="currentColor" />
            <span>Téléchargé</span>
          </div>
        )}

        {queueItem && (
          <>
            <ProgressBar
              value={serverProgress}
              variant="server"
              size="xs"
              style={{ marginTop: '10px' }}
            />
            <div className="mini-status">
              En cours : {queueItem.timeleft || `${serverProgress}%`}
            </div>
          </>
        )}
      </div>
    </button>
  );
}

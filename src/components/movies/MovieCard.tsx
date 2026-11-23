import type { MouseEvent } from 'react';
import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Play, Plus } from 'lucide-react';
import { ProgressBar } from '../ui';

interface MovieCardProps {
  readonly movie: Movie | LookupMovie;
  readonly download?: DownloadInfo;
  readonly queueItem?: QueueRecord;
  readonly isAddHint?: boolean;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
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

  return (
    <button
      type="button"
      className="movie-card"
      // Library poster: found again to take back the focus when its detail page closes
      data-movie-id={'id' in movie ? movie.id : undefined}
      onClick={onClick}
    >
      {posterUrl && <img src={posterUrl} alt={movie.title} loading="lazy" />}
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
            style={{ marginTop: '8px' }}
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
              style={{ marginTop: '8px' }}
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

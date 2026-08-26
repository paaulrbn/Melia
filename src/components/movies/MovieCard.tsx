import { DownloadInfo, LookupMovie, Movie, QueueRecord } from '../../types';
import { getImageUrl } from '../../utils/media';

interface MovieCardProps {
  movie: Movie | LookupMovie;
  download?: DownloadInfo;
  queueItem?: QueueRecord;
  isAddHint?: boolean;
  onClick: () => void;
}

export function MovieCard({
  movie,
  download,
  queueItem,
  isAddHint = false,
  onClick,
}: MovieCardProps) {
  const posterUrl = getImageUrl(movie, 'poster');

  // Calculate Radarr queue progress if applicable
  let serverProgress = 0;
  if (queueItem && queueItem.size > 0) {
    serverProgress = Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100);
  }

  return (
    <div className="movie-card" onClick={onClick}>
      <img src={posterUrl} alt={movie.title} loading="lazy" />
      <div className="movie-overlay">
        <h3>{movie.title}</h3>
        <span className="year">{movie.year}</span>

        {isAddHint && <div className="mini-status add-hint">+ Ajouter</div>}

        {download && (download.status === 'downloading' || download.status === 'paused') && (
          <div className="mini-progress-bar">
            <div
              className={`fill ${download.status === 'paused' ? 'paused' : ''}`}
              style={{ width: `${download.progress}%` }}
            />
          </div>
        )}

        {download && download.status === 'completed' && (
          <div className="mini-status">▶ Téléchargé</div>
        )}

        {queueItem && (
          <>
            <div className="mini-progress-bar">
              <div className="fill" style={{ width: `${serverProgress}%` }} />
            </div>
            <div className="mini-status">
              En cours : {queueItem.timeleft || `${serverProgress}%`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { LookupSeries, Series, UnifiedQueueItem } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Play, Plus } from 'lucide-react';
import { ProgressBar } from '../ui';

interface SeriesCardProps {
  readonly series: Series | LookupSeries;
  readonly localEpisodeCount?: number;
  readonly queueItems?: UnifiedQueueItem[];
  readonly isAddHint?: boolean;
  readonly onClick: () => void;
}

export function SeriesCard({
  series,
  localEpisodeCount = 0,
  queueItems = [],
  isAddHint = false,
  onClick,
}: Readonly<SeriesCardProps>) {
  const posterUrl = getImageUrl(series, 'poster');

  let seasonCount = 0;
  if ('statistics' in series && series.statistics?.seasonCount) {
    seasonCount = series.statistics.seasonCount;
  } else if ('seasons' in series && series.seasons) {
    seasonCount = series.seasons.length;
  }

  let seasonText = '';
  if (seasonCount > 0) {
    const plural = seasonCount > 1 ? 's' : '';
    seasonText = `• ${seasonCount} saison${plural}`;
  }

  // Active queue progress if any episode is in queue
  const activeQueue = queueItems[0];
  let serverProgress = 0;
  if (activeQueue && activeQueue.size > 0) {
    serverProgress = Math.round(((activeQueue.size - activeQueue.sizeleft) / activeQueue.size) * 100);
  }

  return (
    <button
      type="button"
      className="movie-card"
      onClick={onClick}
    >
      {posterUrl && <img src={posterUrl} alt={series.title} loading="lazy" />}
      <div className="movie-overlay">
        <h3>{series.title}</h3>
        <span className="year">
          {series.year} {seasonText}
        </span>

        {isAddHint && (
          <div className="mini-status add-hint">
            <Plus size={13} />
            <span>Ajouter</span>
          </div>
        )}

        {localEpisodeCount > 0 && (
          <div className="mini-status">
            <Play size={12} fill="currentColor" />
            <span>{localEpisodeCount}&nbsp;épisode{localEpisodeCount > 1 ? 's' : ''} en local</span>
          </div>
        )}

        {activeQueue && (
          <>
            <ProgressBar
              value={serverProgress}
              variant="server"
              size="xs"
              style={{ marginTop: '10px' }}
            />
            <div className="mini-status">
              En cours : {activeQueue.timeleft || `${serverProgress}%`}
            </div>
          </>
        )}
      </div>
    </button>
  );
}

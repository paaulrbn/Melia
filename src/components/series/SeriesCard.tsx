import type { MouseEvent } from 'react';
import { LookupSeries, Series, UnifiedQueueItem } from '../../types';
import { getImageUrl } from '../../utils/media';
import { preloadImage } from '../../utils/preloadImages';
import { formatSeasonCount } from '../../utils/series';
import { Play, Plus } from 'lucide-react';
import { Poster, ProgressBar } from '../ui';

interface SeriesCardProps {
  readonly series: Series | LookupSeries;
  readonly localEpisodeCount?: number;
  readonly queueItems?: UnifiedQueueItem[];
  readonly isAddHint?: boolean;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Poster aimed at: the page's episodes can be asked for ahead of time */
  readonly onPrepare?: (seriesId: number) => void;
}

export function SeriesCard({
  series,
  localEpisodeCount = 0,
  queueItems = [],
  isAddHint = false,
  onClick,
  onPrepare,
}: Readonly<SeriesCardProps>) {
  const posterUrl = getImageUrl(series, 'poster');

  // What the series' page shows is asked for as soon as the poster is aimed at, so it is
  // ready when the page opens: the backdrop and the episodes
  const prepareDetail = () => {
    preloadImage(getImageUrl(series, 'fanart'));
    if ('id' in series && typeof series.id === 'number') onPrepare?.(series.id);
  };

  let seasonCount = 0;
  if ('statistics' in series && series.statistics?.seasonCount) {
    seasonCount = series.statistics.seasonCount;
  } else if ('seasons' in series && series.seasons) {
    seasonCount = series.seasons.length;
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
      // Library poster: found again to take back the focus when its detail page closes
      data-series-id={'id' in series ? series.id : undefined}
      onClick={onClick}
      onPointerEnter={prepareDetail}
      onFocus={prepareDetail}
    >
      {posterUrl && <Poster src={posterUrl} alt={series.title} />}
      <div className="movie-overlay">
        <h3>{series.title}</h3>
        <span className="year">{series.year}</span>
        {seasonCount > 0 && <span className="year">{formatSeasonCount(seasonCount)}</span>}

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
              style={{ marginTop: '8px' }}
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

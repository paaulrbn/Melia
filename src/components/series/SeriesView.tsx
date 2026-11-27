import { useMemo } from 'react';
import { DownloadInfo, LookupSeries, Series, UnifiedQueueItem } from '../../types';
import { Settings } from 'lucide-react';
import { seriesGroupHeadingId, seriesGroupSectionId, type SeriesLibraryGroup } from '../../utils/seriesGroups';
import { Button } from '../ui';
import { SeriesCard } from './SeriesCard';

const SKELETON_CARDS = 10;

interface SeriesViewProps {
  readonly searchQuery: string;
  readonly searchResults: LookupSeries[];
  readonly isSearching: boolean;
  readonly series: Series[];
  /** Sections of the library (mine, on the server, waiting), also listed in the sidebar */
  readonly seriesGroups: readonly SeriesLibraryGroup[];
  readonly downloads: Record<string, DownloadInfo>;
  readonly sonarrQueue: UnifiedQueueItem[];
  readonly findInLibrary: (tvdbId: number) => Series | undefined;
  /** Opens the detail page; `trigger` takes the focus back when it closes. */
  readonly onSelectSeries: (series: Series, trigger: HTMLElement) => void;
  /** Opens the page that adds a search result; `trigger` takes the focus back when it closes. */
  readonly onOpenAddSeries: (lookupSeries: LookupSeries, trigger: HTMLElement) => void;
  /** A library poster is aimed at: its episodes can be loaded ahead of time */
  readonly onPrepareSeries?: (seriesId: number) => void;
  readonly isConfigLoaded: boolean;
  readonly isConfigured: boolean;
  readonly hasLoaded: boolean;
  readonly hasLoadError: boolean;
  readonly onOpenSettings: () => void;
}

export function SeriesView({
  searchQuery,
  searchResults,
  isSearching,
  series,
  seriesGroups,
  downloads,
  sonarrQueue,
  findInLibrary,
  onSelectSeries,
  onOpenAddSeries,
  onPrepareSeries,
  isConfigLoaded,
  isConfigured,
  hasLoaded,
  hasLoadError,
  onOpenSettings,
}: Readonly<SeriesViewProps>) {
  const isSearchActive = searchQuery.trim().length > 0;

  // Map seriesId -> count of local completed episodes
  const localEpisodeCountBySeries = useMemo(() => {
    const map = new Map<number, number>();
    Object.values(downloads).forEach(dl => {
      if (dl.mediaType === 'episode' && dl.seriesId && dl.status === 'completed') {
        map.set(dl.seriesId, (map.get(dl.seriesId) || 0) + 1);
      }
    });
    return map;
  }, [downloads]);

  // Map seriesId -> queue items
  const queueBySeriesId = useMemo(() => {
    const map = new Map<number, UnifiedQueueItem[]>();
    sonarrQueue.forEach(item => {
      if (item.seriesId) {
        const list = map.get(item.seriesId) || [];
        list.push(item);
        map.set(item.seriesId, list);
      }
    });
    return map;
  }, [sonarrQueue]);

  const renderSearchContent = () => {
    if (isSearching) {
      return (
        <div className="loading-state">
          <p>Recherche en cours…</p>
        </div>
      );
    }
    if (searchResults.length === 0) {
      return (
        <div className="loading-state">
          <p>Aucun résultat pour «&nbsp;{searchQuery}&nbsp;»</p>
        </div>
      );
    }
    return (
      <div className="movie-grid">
        {searchResults.map(lookup => {
          const librarySeries = findInLibrary(lookup.tvdbId);
          return (
            <SeriesCard
              key={lookup.tvdbId}
              series={lookup}
              isAddHint={!librarySeries}
              onClick={event => {
                if (librarySeries) {
                  onSelectSeries(librarySeries, event.currentTarget);
                } else {
                  onOpenAddSeries(lookup, event.currentTarget);
                }
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderLibraryContent = () => {
    if (isConfigLoaded && !isConfigured) {
      return (
        <div className="empty-state">
          <p>Sonarr n'est pas configuré.</p>
          <Button variant="secondary" leftIcon={<Settings size={16} />} onClick={onOpenSettings}>
            Ouvrir les paramètres
          </Button>
        </div>
      );
    }
    if (series.length === 0) {
      // The StatusBanner above already explains a failed load
      if (hasLoadError) return null;
      if (!hasLoaded) {
        return (
          <div className="movie-grid" role="status" aria-label="Chargement de la bibliothèque…">
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <div key={i} className="movie-skeleton" aria-hidden="true" />
            ))}
          </div>
        );
      }
      return (
        <div className="empty-state">
          <p>Aucune série dans la bibliothèque. Recherchez une série pour l'ajouter.</p>
        </div>
      );
    }
    return (
      <div className="movie-categories">
        {seriesGroups.map(group => (
          <section
            key={group.key}
            id={seriesGroupSectionId(group.key)}
            className="movie-category"
            aria-labelledby={seriesGroupHeadingId(group.key)}
          >
            <h3
              className="category-title"
              id={seriesGroupHeadingId(group.key)}
              tabIndex={-1}
              aria-label={`${group.title}, ${group.series.length} ${group.series.length > 1 ? 'séries' : 'série'}`}
            >
              <span>{group.title}</span>
              <span className="category-count">{group.series.length}</span>
            </h3>
            <div className="movie-grid">
              {group.series.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  localEpisodeCount={localEpisodeCountBySeries.get(s.id) || 0}
                  queueItems={queueBySeriesId.get(s.id)}
                  onClick={event => onSelectSeries(s, event.currentTarget)}
                  onPrepare={onPrepareSeries}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  };

  // Title and search field live in the top row (PageToolbar)
  return <div>{isSearchActive ? renderSearchContent() : renderLibraryContent()}</div>;
}

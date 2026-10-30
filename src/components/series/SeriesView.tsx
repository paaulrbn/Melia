import { useMemo } from 'react';
import { DownloadInfo, LookupSeries, Series, UnifiedQueueItem } from '../../types';
import { Search, Settings, X } from 'lucide-react';
import { Button, Input, IconButton } from '../ui';
import { SeriesCard } from './SeriesCard';

const SKELETON_CARDS = 10;

interface SeriesViewProps {
  readonly searchQuery: string;
  readonly searchResults: LookupSeries[];
  readonly isSearching: boolean;
  readonly onSearchChange: (term: string) => void;
  readonly onClearSearch: () => void;
  readonly series: Series[];
  readonly localSeries: Series[];
  readonly serverSeries: Series[];
  readonly unavailableSeries: Series[];
  readonly downloads: Record<string, DownloadInfo>;
  readonly sonarrQueue: UnifiedQueueItem[];
  readonly findInLibrary: (tvdbId: number) => Series | undefined;
  readonly onSelectSeries: (series: Series) => void;
  readonly onOpenAddSeries: (lookupSeries: LookupSeries) => void;
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
  onSearchChange,
  onClearSearch,
  series,
  localSeries,
  serverSeries,
  unavailableSeries,
  downloads,
  sonarrQueue,
  findInLibrary,
  onSelectSeries,
  onOpenAddSeries,
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
              onClick={() => {
                if (librarySeries) {
                  onSelectSeries(librarySeries);
                } else {
                  onOpenAddSeries(lookup);
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
        {localSeries.length > 0 && (
          <div className="movie-category">
            <h3 className="category-title">Mes séries</h3>
            <div className="movie-grid">
              {localSeries.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  localEpisodeCount={localEpisodeCountBySeries.get(s.id) || 0}
                  queueItems={queueBySeriesId.get(s.id)}
                  onClick={() => onSelectSeries(s)}
                />
              ))}
            </div>
          </div>
        )}

        {serverSeries.length > 0 && (
          <div className="movie-category">
            <h3 className="category-title">Sur le serveur</h3>
            <div className="movie-grid">
              {serverSeries.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  localEpisodeCount={localEpisodeCountBySeries.get(s.id) || 0}
                  queueItems={queueBySeriesId.get(s.id)}
                  onClick={() => onSelectSeries(s)}
                />
              ))}
            </div>
          </div>
        )}

        {unavailableSeries.length > 0 && (
          <div className="movie-category">
            <h3 className="category-title">En attente</h3>
            <div className="movie-grid">
              {unavailableSeries.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  queueItems={queueBySeriesId.get(s.id)}
                  onClick={() => onSelectSeries(s)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2>Séries</h2>

      {/* Search bar */}
      <div className="search-bar">
        <Input
          type="text"
          inputSize="lg"
          placeholder="Rechercher une série…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          leftIcon={<Search size={18} />}
          rightElement={
            searchQuery ? (
              <IconButton
                icon={<X size={16} />}
                onClick={onClearSearch}
                aria-label="Effacer la recherche"
                size="sm"
                shape="circle"
                variant="ghost"
                className="search-clear"
              />
            ) : undefined
          }
        />
      </div>

      {/* Content */}
      {isSearchActive ? renderSearchContent() : renderLibraryContent()}
    </div>
  );
}

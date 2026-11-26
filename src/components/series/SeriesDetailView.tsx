import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CloudDownload, Info, Loader2, Play, Trash2 } from 'lucide-react';
import type { Config, DownloadInfo, Episode, Series, UnifiedQueueItem } from '../../types';
import { getImageUrl, getStreamUrl } from '../../utils/media';
import {
  formatEpisodeCount,
  formatEpisodeTag,
  formatSeasonCount,
  getSeasonNumbers,
  getSeriesStatusText,
  sortEpisodes,
} from '../../utils/series';
import { ConfirmModal } from '../common/ConfirmModal';
import { MediaDetailLayout } from '../media/MediaDetailLayout';
import { EpisodeRow, type ServerEpisodeDeleteTarget } from './EpisodeRow';
import { SeasonTabs, seasonTabId } from './SeasonTabs';

/** "S01E03 Titre" (or the tag alone), for the confirmations. */
function episodeLabel(episode: Episode): string {
  const tag = formatEpisodeTag(episode.seasonNumber, episode.episodeNumber);
  return episode.title ? `${tag} ${episode.title}` : tag;
}

interface SeriesDetailViewProps {
  readonly series: Series;
  readonly episodes: Episode[];
  readonly isLoadingEpisodes: boolean;
  readonly downloads: Record<string, DownloadInfo>;
  readonly sonarrQueue: UnifiedQueueItem[];
  readonly config: Config;
  /** Status banners of the series screen (server unreachable, failed action). */
  readonly notices?: ReactNode;
  /** Back to the list (after a deletion); the top row carries the back button. */
  readonly onBack: () => void;
  readonly onPlay: (pathOrUrl: string, title: string) => void;
  readonly onDownloadEpisode: (series: Series, episode: Episode) => void;
  readonly onCancelDownload: (id: string) => void;
  readonly onDeleteDownload: (id: string, deleteFromDisk: boolean, fallbackFilename?: string) => void;
  readonly onDeleteSeries: (seriesId: number) => void;
  readonly onDeleteEpisodeFile: (seriesId: number, episodeFileId: number) => Promise<void> | void;
  readonly onCancelServerQueue: (queueItem: UnifiedQueueItem) => void;
  readonly onSearchEpisode: (episodeId: number) => Promise<void> | void;
  readonly onSearchSeason: (seriesId: number, seasonNumber: number) => Promise<void> | void;
}

/** How long "Téléchargement lancé" stays on an episode */
const JUST_SEARCHED_MS = 4000;

/** How long the episode list keeps the height it had before a season change (fade + margin) */
const SEASON_HEIGHT_HOLD_MS = 400;

/** The page's scroll area (see App.tsx): the one that must not move when the season changes. */
const PAGE_SCROLLER = '.melia-page';

function playableKey(episode: Episode): string {
  return `episode-${episode.id}`;
}

/**
 * Page of a library series (layout in MediaDetailLayout): the backdrop header holds the
 * facts and the main action (play the first episode available, or what stands in for it),
 * then come the seasons and their episodes, on the same rows as the downloads page.
 */
export function SeriesDetailView({
  series,
  episodes,
  isLoadingEpisodes,
  downloads,
  sonarrQueue,
  config,
  notices,
  onBack,
  onPlay,
  onDownloadEpisode,
  onCancelDownload,
  onDeleteDownload,
  onDeleteSeries,
  onDeleteEpisodeFile,
  onCancelServerQueue,
  onSearchEpisode,
  onSearchSeason,
}: Readonly<SeriesDetailViewProps>) {
  const idPrefix = useId();
  const panelId = `${idPrefix}-episodes`;
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLocalEpisodeId, setDeleteLocalEpisodeId] = useState<string | null>(null);
  const [deleteServerTarget, setDeleteServerTarget] = useState<ServerEpisodeDeleteTarget | null>(null);
  // Cancellations wait for a confirmation, as everywhere else in the app
  const [cancelLocalTarget, setCancelLocalTarget] = useState<{
    readonly id: string;
    readonly filename?: string;
    readonly label: string;
  } | null>(null);
  const [cancelServerTarget, setCancelServerTarget] = useState<{
    readonly item: UnifiedQueueItem;
    readonly label: string;
  } | null>(null);
  const [searchingEpisodeIds, setSearchingEpisodeIds] = useState<Set<number>>(new Set());
  const [justSearchedEpisodeIds, setJustSearchedEpisodeIds] = useState<Set<number>>(new Set());
  const [isSeasonSearching, setIsSeasonSearching] = useState(false);

  const seasons = useMemo(() => getSeasonNumbers(series.seasons), [series.seasons]);
  const activeSeason = selectedSeason !== null && seasons.includes(selectedSeason) ? selectedSeason : seasons[0];

  // Changing season swaps the list: the page keeps its scroll position. The list holds its
  // old height for a moment so a shorter season cannot shrink the page under the reader.
  const panelRef = useRef<HTMLDivElement>(null);
  const keptScrollRef = useRef<number | null>(null);
  const releaseHeightRef = useRef(0);

  const handleSelectSeason = (season: number) => {
    if (season === activeSeason) return;
    const panel = panelRef.current;
    const scroller = panel?.closest<HTMLElement>(PAGE_SCROLLER);
    if (panel && scroller) {
      panel.style.minHeight = `${panel.offsetHeight}px`;
      keptScrollRef.current = scroller.scrollTop;
      window.clearTimeout(releaseHeightRef.current);
      releaseHeightRef.current = window.setTimeout(() => {
        panel.style.minHeight = '';
      }, SEASON_HEIGHT_HOLD_MS);
    }
    setSelectedSeason(season);
  };

  useLayoutEffect(() => {
    const top = keptScrollRef.current;
    keptScrollRef.current = null;
    const scroller = panelRef.current?.closest<HTMLElement>(PAGE_SCROLLER);
    if (top !== null && scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
  }, [activeSeason]);

  useEffect(() => () => window.clearTimeout(releaseHeightRef.current), []);

  const seasonEpisodes = useMemo(
    () => sortEpisodes(episodes.filter(episode => episode.seasonNumber === activeSeason)),
    [episodes, activeSeason]
  );

  const queueByEpisodeId = useMemo(() => {
    const map = new Map<number, UnifiedQueueItem>();
    sonarrQueue.forEach(item => {
      if (item.mediaType === 'episode' && item.mediaId) map.set(item.mediaId, item);
    });
    return map;
  }, [sonarrQueue]);

  const missingSeasonEpisodeIds = useMemo(
    () => seasonEpisodes.filter(ep => !ep.hasFile && !queueByEpisodeId.has(ep.id)).map(ep => ep.id),
    [seasonEpisodes, queueByEpisodeId]
  );

  const firstPlayableEpisode = useMemo(
    () =>
      sortEpisodes(episodes).find(ep => {
        const dl = downloads[playableKey(ep)];
        return (dl?.status === 'completed' && !!dl.path) || (ep.hasFile && !!ep.episodeFile);
      }),
    [episodes, downloads]
  );

  const flagJustSearched = (ids: number[]) => {
    setJustSearchedEpisodeIds(prev => new Set([...prev, ...ids]));
    setTimeout(() => {
      setJustSearchedEpisodeIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    }, JUST_SEARCHED_MS);
  };

  const handleSearchEpisode = async (episodeId: number) => {
    setSearchingEpisodeIds(prev => new Set(prev).add(episodeId));
    try {
      await onSearchEpisode(episodeId);
      flagJustSearched([episodeId]);
    } finally {
      setSearchingEpisodeIds(prev => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
    }
  };

  const handleSearchSeason = async () => {
    if (missingSeasonEpisodeIds.length === 0) return;
    setIsSeasonSearching(true);
    try {
      await onSearchSeason(series.id, activeSeason);
      flagJustSearched(missingSeasonEpisodeIds);
    } finally {
      setIsSeasonSearching(false);
    }
  };

  const handlePlayEpisode = (episode: Episode) => {
    const dl = downloads[playableKey(episode)];
    const tag = formatEpisodeTag(episode.seasonNumber, episode.episodeNumber);
    const title = `${series.title} - ${tag}${episode.title ? ` : ${episode.title}` : ''}`;

    if (dl?.status === 'completed' && dl.path) {
      onPlay(dl.path, title);
    } else if (episode.hasFile && episode.episodeFile) {
      onPlay(getStreamUrl(episode.episodeFile.path, config), title);
    }
  };

  const deleteButton = (
    <button
      type="button"
      className="media-detail-quiet media-detail-quiet--icon media-detail-quiet--danger"
      onClick={() => setShowDeleteConfirm(true)}
      title="Supprimer la série du serveur"
      aria-label="Supprimer la série du serveur"
    >
      <Trash2 size={18} aria-hidden="true" />
    </button>
  );

  const renderPrimary = () => {
    if (firstPlayableEpisode) {
      const tag = formatEpisodeTag(firstPlayableEpisode.seasonNumber, firstPlayableEpisode.episodeNumber);
      return (
        <div className="media-detail-actions">
          <button
            type="button"
            className="media-detail-play"
            onClick={() => handlePlayEpisode(firstPlayableEpisode)}
            title={firstPlayableEpisode.title || undefined}
          >
            <Play className="media-detail-play-icon" size={22} fill="currentColor" aria-hidden="true" />
            {`Lancer ${tag}`}
          </button>
          {deleteButton}
        </div>
      );
    }

    const isLoading = isLoadingEpisodes && episodes.length === 0;
    return (
      <div className="media-detail-missing">
        <div className="media-detail-state">
          {isLoading ? (
            <Loader2 className="media-detail-state-icon animate-spin" size={20} aria-hidden="true" />
          ) : (
            <Info className="media-detail-state-icon" size={20} aria-hidden="true" />
          )}
          <div className="media-detail-state-text">
            <p className="media-detail-state-title">
              {isLoading ? 'Chargement des épisodes' : 'Aucun épisode disponible'}
            </p>
            {!isLoading && (
              <p className="media-detail-state-detail">
                Les épisodes téléchargés sur le serveur apparaîtront ici, prêts à être lancés.
              </p>
            )}
          </div>
        </div>
        <div className="media-detail-actions">{deleteButton}</div>
      </div>
    );
  };

  const renderEpisodes = () => {
    if (isLoadingEpisodes && episodes.length === 0) {
      return (
        <p className="episodes-empty" role="status">
          Chargement des épisodes…
        </p>
      );
    }
    if (seasonEpisodes.length === 0) {
      return <p className="episodes-empty">Aucun épisode répertorié pour cette saison.</p>;
    }
    return (
      <ul className="dl-list episodes-list" key={activeSeason}>
        {seasonEpisodes.map(episode => (
          <li key={episode.id} className="dl-slot">
            <div className="dl-slot-inner">
              <EpisodeRow
                episode={episode}
                series={series}
                download={downloads[playableKey(episode)]}
                queueItem={queueByEpisodeId.get(episode.id)}
                justSearched={justSearchedEpisodeIds.has(episode.id)}
                isSearching={searchingEpisodeIds.has(episode.id)}
                onPlay={handlePlayEpisode}
                onDownload={onDownloadEpisode}
                onPause={onCancelDownload}
                onDelete={(id, _deleteFromDisk, filename) =>
                  setCancelLocalTarget({ id, filename, label: episodeLabel(episode) })
                }
                onCancelServerQueue={item => setCancelServerTarget({ item, label: episodeLabel(episode) })}
                onSearch={handleSearchEpisode}
                onAskDeleteLocal={setDeleteLocalEpisodeId}
                onAskDeleteServer={setDeleteServerTarget}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const seasonCount = series.statistics?.seasonCount ?? 0;
  const totalEpisodes = series.statistics?.totalEpisodeCount ?? 0;
  const statusText = getSeriesStatusText(series.status);

  return (
    <MediaDetailLayout
      title={series.title}
      fanartUrl={getImageUrl(series, 'fanart')}
      posterUrl={getImageUrl(series, 'poster')}
      credit={series.network || undefined}
      facts={
        <>
          {series.year > 0 && <li>{series.year}</li>}
          {statusText && <li>{statusText}</li>}
          {seasonCount > 0 && <li>{formatSeasonCount(seasonCount)}</li>}
          {totalEpisodes > 0 && (
            <li>{formatEpisodeCount(series.statistics?.episodeFileCount ?? 0, totalEpisodes)}</li>
          )}
        </>
      }
      primary={renderPrimary()}
      notices={notices}
      overview={series.overview}
      sections={
        <section className="episodes-panel" aria-labelledby={`${idPrefix}-episodes-title`}>
          <h3 className="sr-only" id={`${idPrefix}-episodes-title`}>
            Épisodes
          </h3>
          <div className="episodes-bar">
            <SeasonTabs
              seasons={seasons}
              value={activeSeason}
              onChange={handleSelectSeason}
              idPrefix={idPrefix}
              panelId={panelId}
            />
            {missingSeasonEpisodeIds.length > 0 && (
              <button
                type="button"
                className="media-detail-quiet episodes-season-download"
                onClick={handleSearchSeason}
                disabled={isSeasonSearching}
                aria-busy={isSeasonSearching}
                title={`Télécharger les ${missingSeasonEpisodeIds.length} épisodes manquants de la saison ${activeSeason}`}
              >
                {isSeasonSearching ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <CloudDownload size={18} aria-hidden="true" />
                )}
                {isSeasonSearching ? 'Téléchargement…' : 'Télécharger la saison'}
              </button>
            )}
          </div>
          <div
            ref={panelRef}
            id={panelId}
            role="tabpanel"
            aria-labelledby={seasonTabId(idPrefix, activeSeason)}
          >
            {renderEpisodes()}
          </div>
        </section>
      }
    >
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Supprimer la série"
        message={
          <>
            Voulez-vous vraiment supprimer <strong>{series.title}</strong> du serveur&nbsp;? La série et tous ses
            fichiers vidéo seront définitivement effacés.
          </>
        }
        confirmLabel="Supprimer la série"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDeleteSeries(series.id);
          onBack();
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        isOpen={deleteLocalEpisodeId !== null}
        title="Supprimer l’épisode de cet ordinateur"
        message="Voulez-vous vraiment supprimer cet épisode de votre disque local ? Le fichier vidéo sera définitivement effacé."
        confirmLabel="Supprimer le fichier"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => {
          if (deleteLocalEpisodeId) onDeleteDownload(deleteLocalEpisodeId, true);
          setDeleteLocalEpisodeId(null);
        }}
        onClose={() => setDeleteLocalEpisodeId(null)}
      />

      <ConfirmModal
        isOpen={deleteServerTarget !== null}
        title="Supprimer l’épisode du serveur"
        message={
          deleteServerTarget ? (
            <>
              Voulez-vous vraiment supprimer définitivement le fichier vidéo de{' '}
              <strong>
                {formatEpisodeTag(deleteServerTarget.seasonNumber, deleteServerTarget.episodeNumber)} (
                {deleteServerTarget.title})
              </strong>{' '}
              du serveur&nbsp;?
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Supprimer du serveur"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => {
          if (deleteServerTarget) void onDeleteEpisodeFile(series.id, deleteServerTarget.episodeFileId);
          setDeleteServerTarget(null);
        }}
        onClose={() => setDeleteServerTarget(null)}
      />

      <ConfirmModal
        isOpen={cancelLocalTarget !== null}
        title="Annuler le téléchargement"
        message={
          <>
            Voulez-vous vraiment annuler le téléchargement de{' '}
            <strong>
              {series.title} ({cancelLocalTarget?.label})
            </strong>
            &nbsp;?
          </>
        }
        confirmLabel="Annuler le téléchargement"
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          if (cancelLocalTarget) onDeleteDownload(cancelLocalTarget.id, true, cancelLocalTarget.filename);
          setCancelLocalTarget(null);
        }}
        onClose={() => setCancelLocalTarget(null)}
      />

      <ConfirmModal
        isOpen={cancelServerTarget !== null}
        title="Annuler le téléchargement sur le serveur"
        message={
          <>
            Voulez-vous vraiment annuler le téléchargement de{' '}
            <strong>
              {series.title} ({cancelServerTarget?.label})
            </strong>{' '}
            sur le serveur&nbsp;?
          </>
        }
        confirmLabel="Annuler le téléchargement"
        cancelLabel="Conserver"
        variant="danger"
        onConfirm={() => {
          if (cancelServerTarget) onCancelServerQueue(cancelServerTarget.item);
          setCancelServerTarget(null);
        }}
        onClose={() => setCancelServerTarget(null)}
      />
    </MediaDetailLayout>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { Config, DownloadInfo, Episode, Series, UnifiedQueueItem } from '../../types';
import { formatDuration, formatSize } from '../../utils/formatters';
import { getImageUrl, getStreamUrl } from '../../utils/media';
import { getEpisodeDownloadRelativePath } from '../../services/downloads';
import { Modal } from '../common/Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Play, Pause, Trash2, Download, Loader2, X } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '../ui';

interface SeriesDetailModalProps {
  readonly series: Series | null;
  readonly episodes: Episode[];
  readonly isLoadingEpisodes: boolean;
  readonly downloads: Record<string, DownloadInfo>;
  readonly sonarrQueue: UnifiedQueueItem[];
  readonly config: Config;
  readonly onClose: () => void;
  readonly onPlayStream: (streamUrl: string, title: string) => void;
  readonly onPlayLocal: (filePath: string, title: string) => void;
  readonly onDownloadEpisode: (series: Series, episode: Episode) => void;
  readonly onCancelDownload: (id: string) => void;
  readonly onDeleteDownload: (id: string, deleteFromDisk: boolean, fallbackFilename?: string) => void;
  readonly onDeleteSeries: (seriesId: number) => void;
  readonly onDeleteEpisodeFile?: (seriesId: number, episodeFileId: number) => Promise<void> | void;
  readonly onCancelServerQueue?: (queueItem: UnifiedQueueItem) => void;
  readonly onRefreshEpisodes?: () => void;
  readonly onSearchEpisode: (episodeId: number) => Promise<void> | void;
  readonly onSearchSeason?: (seriesId: number, seasonNumber: number) => Promise<void> | void;
}

function getSeriesStatusText(status?: string): string {
  if (status === 'continuing') return 'En cours';
  if (status === 'ended') return 'Terminée';
  return status ?? '';
}

function formatEpisodeQueueText(queueItem: UnifiedQueueItem): string {
  const percent = queueItem.size > 0
    ? ` (${Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)}\u00A0%)`
    : '';
  const timeText = queueItem.timeleft || 'en cours';
  return `Téléchargement${percent} : ${timeText}`;
}

function getEpisodeRowClassName(isPlayable: boolean, isDownloading: boolean): string {
  if (isPlayable) return 'series-episode-row series-episode-row--playable';
  if (isDownloading) return 'series-episode-row series-episode-row--downloading';
  return 'series-episode-row series-episode-row--unavailable';
}

function getEpisodeTooltip(isLocal: boolean, isServer: boolean, titleText: string): string | undefined {
  if (isLocal) return `Lancer l'épisode local (${titleText})`;
  if (isServer) return `Lire en streaming (${titleText})`;
  return undefined;
}

interface EpisodeActionsProps {
  ep: Episode;
  series: Series;
  epKey: string;
  isLocal: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  isServer: boolean;
  queueItem?: UnifiedQueueItem;
  justSearched: boolean;
  isSearching: boolean;
  onDownloadEpisode: (series: Series, ep: Episode) => void;
  onCancelDownload: (id: string) => void;
  onDeleteDownload: (id: string, deleteFile: boolean, relativePath?: string) => void;
  onCancelServerQueue?: (item: UnifiedQueueItem) => void;
  onTriggerEpisodeSearch: (episodeId: number) => void;
  onDeleteTargetEpisodeId: (id: string) => void;
  onDeleteServerEpisodeTarget: (target: {
    readonly episodeFileId: number;
    readonly title: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
  }) => void;
}

function EpisodeActions({
  ep,
  series,
  epKey,
  isLocal,
  isDownloading,
  isPaused,
  isServer,
  queueItem,
  justSearched,
  isSearching,
  onDownloadEpisode,
  onCancelDownload,
  onDeleteDownload,
  onCancelServerQueue,
  onTriggerEpisodeSearch,
  onDeleteTargetEpisodeId,
  onDeleteServerEpisodeTarget,
}: Readonly<EpisodeActionsProps>) {
  if (isLocal) {
    return (
      <IconButton
        icon={<Trash2 size={16} />}
        variant="danger"
        size="sm"
        onClick={() => onDeleteTargetEpisodeId(epKey)}
        title="Supprimer l'épisode local"
        aria-label="Supprimer l'épisode local"
      />
    );
  }

  if (isDownloading) {
    return (
      <>
        <IconButton
          icon={<Pause size={14} fill="currentColor" />}
          variant="secondary"
          size="sm"
          onClick={() => onCancelDownload(epKey)}
          title="Mettre en pause"
          aria-label="Mettre en pause"
        />
        <Button
          variant="danger"
          size="sm"
          leftIcon={<X size={14} />}
          onClick={() =>
            onDeleteDownload(epKey, true, getEpisodeDownloadRelativePath(series, ep))
          }
          title="Annuler le téléchargement"
        >
          Annuler
        </Button>
      </>
    );
  }

  if (isPaused) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Play size={14} fill="currentColor" />}
          onClick={() => onDownloadEpisode(series, ep)}
          title="Reprendre"
        >
          Reprendre
        </Button>
        <IconButton
          icon={<Trash2 size={16} />}
          variant="danger"
          size="sm"
          onClick={() =>
            onDeleteDownload(epKey, true, getEpisodeDownloadRelativePath(series, ep))
          }
          title="Annuler le téléchargement"
          aria-label="Annuler le téléchargement"
        />
      </>
    );
  }

  if (isServer) {
    return (
      <>
        <IconButton
          icon={<Download size={16} />}
          variant="ghost"
          size="sm"
          onClick={() => onDownloadEpisode(series, ep)}
          title="Télécharger en local"
          aria-label="Télécharger en local"
        />
        <IconButton
          icon={<Trash2 size={16} />}
          variant="danger"
          size="sm"
          onClick={() =>
            onDeleteServerEpisodeTarget({
              episodeFileId: ep.episodeFile?.id ?? 0,
              title: ep.title || `Épisode ${ep.episodeNumber}`,
              seasonNumber: ep.seasonNumber,
              episodeNumber: ep.episodeNumber,
            })
          }
          title="Supprimer du serveur"
          aria-label="Supprimer du serveur"
        />
      </>
    );
  }

  if (queueItem) {
    return (
      <Button
        variant="danger"
        size="sm"
        leftIcon={<X size={14} />}
        onClick={() => onCancelServerQueue?.(queueItem)}
        title="Annuler le téléchargement sur le serveur"
      >
        Annuler
      </Button>
    );
  }

  if (justSearched) {
    return (
      <span className="episode-badge episode-badge--pending">
        <Loader2 size={12} className="animate-spin" /> Téléchargement lancé
      </span>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      isLoading={isSearching}
      leftIcon={<Download size={14} />}
      onClick={() => onTriggerEpisodeSearch(ep.id)}
      title="Télécharger cet épisode sur le serveur"
    >
      {isSearching ? 'Téléchargement…' : 'Télécharger'}
    </Button>
  );
}

interface EpisodeRowProps {
  ep: Episode;
  series: Series;
  dl?: DownloadInfo;
  queueItem?: UnifiedQueueItem;
  justSearched: boolean;
  isSearching: boolean;
  onPlayEpisode: (ep: Episode) => void;
  onDownloadEpisode: (series: Series, ep: Episode) => void;
  onCancelDownload: (id: string) => void;
  onDeleteDownload: (id: string, deleteFile: boolean, relativePath?: string) => void;
  onCancelServerQueue?: (item: UnifiedQueueItem) => void;
  onTriggerEpisodeSearch: (episodeId: number) => void;
  onDeleteTargetEpisodeId: (id: string) => void;
  onDeleteServerEpisodeTarget: (target: {
    readonly episodeFileId: number;
    readonly title: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
  }) => void;
}

function EpisodeRow({
  ep,
  series,
  dl,
  queueItem,
  justSearched,
  isSearching,
  onPlayEpisode,
  onDownloadEpisode,
  onCancelDownload,
  onDeleteDownload,
  onCancelServerQueue,
  onTriggerEpisodeSearch,
  onDeleteTargetEpisodeId,
  onDeleteServerEpisodeTarget,
}: Readonly<EpisodeRowProps>) {
  const epKey = `episode-${ep.id}`;
  const isLocal = dl?.status === 'completed' && !!dl.path;
  const isServer = ep.hasFile && !!ep.episodeFile;
  const isPlayable = isLocal || isServer;
  const isDownloading = dl?.status === 'downloading';
  const isPaused = dl?.status === 'paused';
  const episodeTitle = ep.title || `Épisode ${ep.episodeNumber}`;
  const tooltip = getEpisodeTooltip(isLocal, isServer, episodeTitle);

  return (
    <div
      key={ep.id}
      className={getEpisodeRowClassName(isPlayable, isDownloading)}
      title={tooltip}
    >
      {isPlayable ? (
        <button
          type="button"
          className="episode-index-wrap"
          onClick={() => onPlayEpisode(ep)}
          title={`Lire ${episodeTitle}`}
          aria-label={`Lire ${episodeTitle}`}
        >
          <span className="episode-index-number">
            {String(ep.episodeNumber).padStart(2, '0')}
          </span>
          <span className="episode-index-play">
            <Play size={14} fill="currentColor" />
          </span>
        </button>
      ) : (
        <div className="episode-index-wrap">
          <span className="episode-index-number">
            {String(ep.episodeNumber).padStart(2, '0')}
          </span>
        </div>
      )}

      <div className="episode-info">
        <div className="episode-title-row">
          {isPlayable ? (
            <button
              type="button"
              className="episode-title-btn"
              onClick={() => onPlayEpisode(ep)}
              title={`Lire ${episodeTitle}`}
            >
              <span className="episode-title">{episodeTitle}</span>
            </button>
          ) : (
            <span className="episode-title" title={episodeTitle}>
              {episodeTitle}
            </span>
          )}
        </div>

        {ep.overview && (
          <p className="episode-overview" title={ep.overview}>
            {ep.overview}
          </p>
        )}

        <div className="episode-meta-row">
          {ep.runtime ? <span>{formatDuration(ep.runtime)}</span> : null}
          {ep.episodeFile?.size ? (
            <>
              {ep.runtime ? <span className="meta-dot">•</span> : null}
              <span>{formatSize(ep.episodeFile.size)}</span>
            </>
          ) : null}
          {queueItem && (
            <>
              {(ep.runtime || ep.episodeFile?.size) ? <span className="meta-dot">•</span> : null}
              <span className="episode-queue-status">
                {formatEpisodeQueueText(queueItem)}
              </span>
            </>
          )}
          {dl && isDownloading && (
            <>
              <span className="meta-dot">•</span>
              <span className="episode-dl-status">{dl.stats}</span>
            </>
          )}
        </div>

        {isDownloading && (
          <ProgressBar value={dl.progress} size="xs" style={{ marginTop: '8px' }} />
        )}
        {queueItem && queueItem.size > 0 && (
          <ProgressBar
            value={Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)}
            variant="server"
            size="xs"
            style={{ marginTop: '8px' }}
          />
        )}
      </div>

      <div className="episode-actions">
        <EpisodeActions
          ep={ep}
          series={series}
          epKey={epKey}
          isLocal={isLocal}
          isDownloading={isDownloading}
          isPaused={isPaused}
          isServer={isServer}
          queueItem={queueItem}
          justSearched={justSearched}
          isSearching={isSearching}
          onDownloadEpisode={onDownloadEpisode}
          onCancelDownload={onCancelDownload}
          onDeleteDownload={onDeleteDownload}
          onCancelServerQueue={onCancelServerQueue}
          onTriggerEpisodeSearch={onTriggerEpisodeSearch}
          onDeleteTargetEpisodeId={onDeleteTargetEpisodeId}
          onDeleteServerEpisodeTarget={onDeleteServerEpisodeTarget}
        />
      </div>
    </div>
  );
}

export function SeriesDetailModal({
  series,
  episodes,
  isLoadingEpisodes,
  downloads,
  sonarrQueue,
  config,
  onClose,
  onPlayStream,
  onPlayLocal,
  onDownloadEpisode,
  onCancelDownload,
  onDeleteDownload,
  onDeleteSeries,
  onDeleteEpisodeFile,
  onCancelServerQueue,
  onRefreshEpisodes: _onRefreshEpisodes,
  onSearchEpisode,
  onSearchSeason,
}: Readonly<SeriesDetailModalProps>) {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetEpisodeId, setDeleteTargetEpisodeId] = useState<string | null>(null);
  const [deleteServerEpisodeTarget, setDeleteServerEpisodeTarget] = useState<{
    readonly episodeFileId: number;
    readonly title: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
  } | null>(null);
  const [searchingEpisodeIds, setSearchingEpisodeIds] = useState<Set<number>>(new Set());
  const [justSearchedEpisodeIds, setJustSearchedEpisodeIds] = useState<Set<number>>(new Set());
  const [isSeasonSearching, setIsSeasonSearching] = useState(false);

  // Reset season selector whenever a new series is clicked / opened
  useEffect(() => {
    setSelectedSeason(null);
  }, [series?.id]);

  const handleTriggerEpisodeSearch = async (episodeId: number) => {
    setSearchingEpisodeIds(prev => new Set(prev).add(episodeId));
    try {
      await onSearchEpisode(episodeId);
      setJustSearchedEpisodeIds(prev => new Set(prev).add(episodeId));
      setTimeout(() => {
        setJustSearchedEpisodeIds(prev => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
      }, 4000);
    } finally {
      setSearchingEpisodeIds(prev => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
    }
  };

  const seasonsList = useMemo(() => {
    if (!series?.seasons || series.seasons.length === 0) return [1];
    return series.seasons
      .map(s => s.seasonNumber)
      .filter(num => num > 0)
      .sort((a, b) => a - b);
  }, [series]);

  const activeSeason = selectedSeason ?? seasonsList[0] ?? 1;

  const currentSeasonEpisodes = useMemo(() => {
    return episodes
      .filter(ep => ep.seasonNumber === activeSeason)
      .sort((a, b) => a.episodeNumber - b.episodeNumber);
  }, [episodes, activeSeason]);

  // Queue map for current series episodes
  const queueByEpisodeId = useMemo(() => {
    const map = new Map<number, UnifiedQueueItem>();
    sonarrQueue.forEach(item => {
      if (item.mediaType === 'episode' && item.mediaId) {
        map.set(item.mediaId, item);
      }
    });
    return map;
  }, [sonarrQueue]);

  const missingSeasonEpisodeIds = useMemo(() => {
    return currentSeasonEpisodes
      .filter(ep => !ep.hasFile && !queueByEpisodeId.has(ep.id))
      .map(ep => ep.id);
  }, [currentSeasonEpisodes, queueByEpisodeId]);

  const handleTriggerSeasonSearch = async () => {
    if (!series || missingSeasonEpisodeIds.length === 0) return;
    setIsSeasonSearching(true);
    try {
      if (onSearchSeason) {
        await onSearchSeason(series.id, activeSeason);
      } else {
        for (const epId of missingSeasonEpisodeIds) {
          await onSearchEpisode(epId);
        }
      }
      setJustSearchedEpisodeIds(prev => {
        const next = new Set(prev);
        missingSeasonEpisodeIds.forEach(id => next.add(id));
        return next;
      });
      setTimeout(() => {
        setJustSearchedEpisodeIds(prev => {
          const next = new Set(prev);
          missingSeasonEpisodeIds.forEach(id => next.delete(id));
          return next;
        });
      }, 4000);
    } finally {
      setIsSeasonSearching(false);
    }
  };

  const firstPlayableEpisode = useMemo(() => {
    const allSorted = [...episodes].sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
      return a.episodeNumber - b.episodeNumber;
    });

    return allSorted.find(ep => {
      const epKey = `episode-${ep.id}`;
      const dl = downloads[epKey];
      const isLocal = dl?.status === 'completed' && !!dl.path;
      const isServer = ep.hasFile && !!ep.episodeFile;
      return isLocal || isServer;
    });
  }, [episodes, downloads]);

  const handlePlayEpisode = (ep: Episode) => {
    const epKey = `episode-${ep.id}`;
    const dl = downloads[epKey];
    const isLocal = dl?.status === 'completed' && !!dl.path;
    const titleSuffix = ep.title ? ` : ${ep.title}` : '';
    const title = `${series?.title || 'Série'} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(
      ep.episodeNumber
    ).padStart(2, '0')}${titleSuffix}`;

    if (isLocal) {
      onPlayLocal(dl.path!, title);
    } else if (ep.hasFile && ep.episodeFile) {
      const streamUrl = getStreamUrl(ep.episodeFile.path, config);
      onPlayStream(streamUrl, title);
    }
  };

  if (!series) return null;

  const fanartUrl = getImageUrl(series, 'fanart');
  const statusText = getSeriesStatusText(series.status);

  const renderHeroAction = () => {
    if (!firstPlayableEpisode) {
      return (
        <div className="series-hero-unavailable-notice">
          <span>Aucun épisode disponible pour l'instant sur le serveur.</span>
        </div>
      );
    }

    const hasCustomTitle =
      !!firstPlayableEpisode.title &&
      firstPlayableEpisode.title.trim().toLowerCase() !==
        `épisode ${firstPlayableEpisode.episodeNumber}`.toLowerCase();

    const displayTitle = hasCustomTitle
      ? firstPlayableEpisode.title
      : `Épisode ${firstPlayableEpisode.episodeNumber}`;

    const displayMeta = `Saison\u00A0${firstPlayableEpisode.seasonNumber} • Épisode\u00A0${firstPlayableEpisode.episodeNumber}`;

    return (
      <Button
        variant="primary"
        size="lg"
        leftIcon={<Play size={20} fill="currentColor" />}
        onClick={() => handlePlayEpisode(firstPlayableEpisode)}
        className="series-hero-play-btn"
        title={`Lancer ${displayTitle} (${displayMeta})`}
      >
        <div className="series-hero-play-content">
          <span className="series-hero-play-title">{displayTitle}</span>
          <span className="series-hero-play-meta">{displayMeta}</span>
        </div>
      </Button>
    );
  };

  const renderEpisodesList = () => {
    if (isLoadingEpisodes && episodes.length === 0) {
      return (
        <div className="loading-state" style={{ padding: '30px 0' }}>
          <p>Chargement des épisodes...</p>
        </div>
      );
    }

    if (currentSeasonEpisodes.length === 0) {
      return (
        <div className="loading-state" style={{ padding: '30px 0' }}>
          <p>Aucun épisode répertorié pour cette saison</p>
        </div>
      );
    }

    return currentSeasonEpisodes.map(ep => (
      <EpisodeRow
        key={ep.id}
        ep={ep}
        series={series}
        dl={downloads[`episode-${ep.id}`]}
        queueItem={queueByEpisodeId.get(ep.id)}
        justSearched={justSearchedEpisodeIds.has(ep.id)}
        isSearching={searchingEpisodeIds.has(ep.id)}
        onPlayEpisode={handlePlayEpisode}
        onDownloadEpisode={onDownloadEpisode}
        onCancelDownload={onCancelDownload}
        onDeleteDownload={onDeleteDownload}
        onCancelServerQueue={onCancelServerQueue}
        onTriggerEpisodeSearch={handleTriggerEpisodeSearch}
        onDeleteTargetEpisodeId={setDeleteTargetEpisodeId}
        onDeleteServerEpisodeTarget={setDeleteServerEpisodeTarget}
      />
    ));
  };

  return (
    <>
      <Modal isOpen={!!series} onClose={onClose}>
        <div
          className="modal-header"
          style={{ backgroundImage: fanartUrl ? `url(${fanartUrl})` : undefined }}
        >
          <div className="modal-header-gradient">
            <div className="modal-title-area">
              <h2>
                {series.title} <span className="modal-year">({series.year})</span>
              </h2>
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-meta-row">
            <span className="movie-runtime">{series.year}</span>
            {statusText && (
              <>
                <span className="meta-dot">•</span>
                <span>{statusText}</span>
              </>
            )}
            {series.statistics?.seasonCount ? (
              <>
                <span className="meta-dot">•</span>
                <span>
                  {series.statistics.seasonCount} saison{series.statistics.seasonCount > 1 ? 's' : ''}
                </span>
              </>
            ) : null}
            {series.statistics?.totalEpisodeCount ? (
              <>
                <span className="meta-dot">•</span>
                <span className="file-size-info">
                  {series.statistics.episodeFileCount || 0}&nbsp;/&nbsp;{series.statistics.totalEpisodeCount}&nbsp;épisodes
                </span>
              </>
            ) : null}
          </div>

          {series.overview && <p className="overview">{series.overview}</p>}

          {/* Hero Action Row */}
          <div className="series-hero-actions">
            {renderHeroAction()}

            <IconButton
              icon={<Trash2 size={20} />}
              variant="danger"
              size="lg"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowDeleteConfirm(true)}
              title="Supprimer la série du serveur"
              aria-label="Supprimer la série du serveur"
            />
          </div>

          {/* Season Selector */}
          <div className="series-seasons-bar">
            <div className="series-seasons-tabs">
              {seasonsList.map(seasonNum => (
                <button
                  key={seasonNum}
                  type="button"
                  className={`season-tab-btn ${activeSeason === seasonNum ? 'active' : ''}`}
                  onClick={() => setSelectedSeason(seasonNum)}
                >
                  Saison {seasonNum}
                </button>
              ))}
            </div>

            {missingSeasonEpisodeIds.length > 0 && (
              <div className="series-seasons-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isSeasonSearching}
                  leftIcon={<Download size={14} />}
                  onClick={handleTriggerSeasonSearch}
                  title={`Télécharger tous les épisodes de la saison\u00A0${activeSeason} (${missingSeasonEpisodeIds.length})`}
                >
                  {isSeasonSearching ? 'Téléchargement…' : 'Télécharger la saison'}
                </Button>
              </div>
            )}
          </div>

          {/* Episode List */}
          <div className="series-episodes-list">
            {renderEpisodesList()}
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Series */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Supprimer la série"
        message={`Êtes-vous sûr de vouloir supprimer définitivement « ${series.title} » du serveur ?`}
        confirmLabel="Supprimer la série"
        variant="danger"
        onConfirm={() => {
          onDeleteSeries(series.id);
          setShowDeleteConfirm(false);
          onClose();
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />

      {/* Confirm Delete Local Episode */}
      <ConfirmModal
        isOpen={!!deleteTargetEpisodeId}
        title="Supprimer l'épisode local"
        message="Êtes-vous sûr de vouloir supprimer cet épisode de votre disque local ?"
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetEpisodeId) {
            onDeleteDownload(deleteTargetEpisodeId, true);
            setDeleteTargetEpisodeId(null);
          }
        }}
        onClose={() => setDeleteTargetEpisodeId(null)}
      />

      {/* Confirm Delete Server Episode */}
      <ConfirmModal
        isOpen={!!deleteServerEpisodeTarget}
        title="Supprimer l'épisode du serveur"
        message={
          deleteServerEpisodeTarget ? (
            <>
              Êtes-vous sûr de vouloir supprimer définitivement le fichier vidéo de{' '}
              <strong>
                S{String(deleteServerEpisodeTarget.seasonNumber).padStart(2, '0')}E{String(deleteServerEpisodeTarget.episodeNumber).padStart(2, '0')}{' '}
                ({deleteServerEpisodeTarget.title})
              </strong>{' '}
              du serveur&nbsp;?
            </>
          ) : ''
        }
        confirmLabel="Supprimer du serveur"
        variant="danger"
        onConfirm={() => {
          if (deleteServerEpisodeTarget && onDeleteEpisodeFile) {
            onDeleteEpisodeFile(series.id, deleteServerEpisodeTarget.episodeFileId);
            setDeleteServerEpisodeTarget(null);
          }
        }}
        onClose={() => setDeleteServerEpisodeTarget(null)}
      />
    </>
  );
}

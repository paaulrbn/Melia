import { useState, useMemo } from 'react';
import { DownloadInfo, Movie, Series, UnifiedQueueItem } from '../../types';
import { formatSize } from '../../utils/formatters';
import { getImageUrl } from '../../utils/media';
import { Badge, Button, IconButton, ProgressBar } from '../ui';
import { DownloadItem } from './DownloadItem';
import { ConfirmModal } from '../common/ConfirmModal';
import { Tv, Film, Play, Pause, Trash2, X } from 'lucide-react';

interface DownloadsViewProps {
  readonly downloads: Record<string, DownloadInfo>;
  readonly serverQueueList: UnifiedQueueItem[];
  readonly movies: Movie[];
  readonly series: Series[];
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly onPlay: (path: string, title?: string) => void;
  readonly onDelete: (id: string, deleteFromDisk: boolean) => void;
  readonly onCancelServerQueue?: (item: UnifiedQueueItem) => void;
  readonly onSelectMovie?: (movie: Movie) => void;
  readonly onSelectSeries?: (series: Series) => void;
}

function getEpisodeTag(seasonNumber?: number, episodeNumber?: number): string {
  const s = seasonNumber !== undefined ? String(seasonNumber).padStart(2, '0') : '01';
  const e = episodeNumber !== undefined ? String(episodeNumber).padStart(2, '0') : '01';
  return `S${s}E${e}`;
}

function getEpisodeDisplayTitle(subTitle?: string, fallbackNumber?: number): string {
  if (!subTitle) return fallbackNumber ? `Épisode ${fallbackNumber}` : '';
  const cleaned = subTitle.replace(/^S\d+E\d+\s*[•\-–—:]\s*/i, '').trim();
  if (!cleaned) return fallbackNumber ? `Épisode ${fallbackNumber}` : subTitle;
  return cleaned;
}

interface HasSeasonAndEpisode {
  seasonNumber?: number;
  episodeNumber?: number;
}

function sortGroupsEpisodes<T extends HasSeasonAndEpisode>(groups: { episodes: T[] }[]): void {
  groups.forEach(group => {
    group.episodes.sort((a, b) => {
      const sA = a.seasonNumber ?? 0;
      const sB = b.seasonNumber ?? 0;
      if (sA !== sB) return sA - sB;
      const eA = a.episodeNumber ?? 0;
      const eB = b.episodeNumber ?? 0;
      return eA - eB;
    });
  });
}

function resolveSeriesForEpisode(ep: { title?: string; seriesId?: number }, seriesList: Series[]) {
  const epTitleNorm = (ep.title || '').trim().toLowerCase();
  const foundSeries = seriesList.find(
    s => (ep.seriesId && s.id === ep.seriesId) || s.title.trim().toLowerCase() === epTitleNorm
  );
  const canonicalSeriesId = foundSeries?.id || ep.seriesId;
  const key = canonicalSeriesId ? `series-${canonicalSeriesId}` : `title-${epTitleNorm}`;
  return { foundSeries, canonicalSeriesId, key };
}

interface SeriesGroupHeaderProps {
  readonly seriesObj?: Series;
  readonly seriesTitle: string;
  readonly episodeCount: number;
  readonly onSelectSeries?: (series: Series) => void;
}

function SeriesGroupHeader({
  seriesObj,
  seriesTitle,
  episodeCount,
  onSelectSeries,
}: Readonly<SeriesGroupHeaderProps>) {
  const posterUrl = seriesObj ? getImageUrl(seriesObj, 'poster') : null;
  const isClickable = !!seriesObj && !!onSelectSeries;

  const handleClick = () => {
    if (seriesObj && onSelectSeries) onSelectSeries(seriesObj);
  };

  const content = (
    <div className="download-series-group-info">
      {posterUrl ? (
        <img src={posterUrl} alt="" className="download-series-group-poster" />
      ) : (
        <Tv size={16} className="download-series-group-icon" />
      )}
      <h4 className="download-series-group-title">{seriesTitle}</h4>
      <span className="download-series-group-count">
        {episodeCount}&nbsp;épisode{episodeCount > 1 ? 's' : ''}
      </span>
    </div>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        className="download-series-group-header is-clickable"
        onClick={handleClick}
        title="Cliquer pour voir la série"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="download-series-group-header">
      {content}
    </div>
  );
}

export function DownloadsView({
  downloads,
  serverQueueList,
  movies,
  series,
  onPause,
  onResume,
  onPlay,
  onDelete,
  onCancelServerQueue,
  onSelectMovie,
  onSelectSeries,
}: Readonly<DownloadsViewProps>) {
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    title: string;
    subTitle?: string;
    isCompleted: boolean;
  } | null>(null);

  const localDownloadList = useMemo(() => {
    return Object.values(downloads).sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      return 0;
    });
  }, [downloads]);

  // Server Downloads: Separate Movies & Series Groups
  const serverMovies = useMemo(
    () => serverQueueList.filter(item => item.mediaType === 'movie'),
    [serverQueueList]
  );

  const serverSeriesGroups = useMemo(() => {
    const episodes = serverQueueList.filter(item => item.mediaType === 'episode');
    const groupsMap = new Map<string, { seriesId?: number; seriesTitle: string; seriesObj?: Series; episodes: UnifiedQueueItem[] }>();

    for (const ep of episodes) {
      const { foundSeries, canonicalSeriesId, key } = resolveSeriesForEpisode(ep, series);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          seriesId: canonicalSeriesId,
          seriesTitle: foundSeries?.title || ep.title,
          seriesObj: foundSeries,
          episodes: [],
        });
      }

      const currentGroup = groupsMap.get(key)!;
      const existingIdx = currentGroup.episodes.findIndex(item => {
        if (item.id === ep.id) return true;
        if (item.queueId !== undefined && ep.queueId !== undefined && item.queueId === ep.queueId) return true;
        const sMatch = (item.seasonNumber ?? 0) === (ep.seasonNumber ?? 0);
        const eMatch = (item.episodeNumber ?? 0) === (ep.episodeNumber ?? 0);
        return sMatch && eMatch;
      });

      if (existingIdx >= 0) {
        currentGroup.episodes[existingIdx] = ep;
      } else {
        currentGroup.episodes.push(ep);
      }
    }

    const result = Array.from(groupsMap.values());
    sortGroupsEpisodes(result);
    return result;
  }, [serverQueueList, series]);

  // Local Downloads: Separate Movies & Series Groups
  const localMovies = useMemo(() => {
    const rawMovies = localDownloadList.filter(item => item.mediaType === 'movie');
    const seen = new Set<string>();
    return rawMovies.filter(item => {
      const key = item.path ? item.path.toLowerCase() : String(item.mediaId || item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [localDownloadList]);

  const localSeriesGroups = useMemo(() => {
    const episodes = localDownloadList.filter(item => item.mediaType === 'episode');
    const groupsMap = new Map<string, { seriesId?: number; seriesTitle: string; seriesObj?: Series; episodes: DownloadInfo[] }>();

    for (const ep of episodes) {
      const { foundSeries, canonicalSeriesId, key } = resolveSeriesForEpisode(ep, series);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          seriesId: canonicalSeriesId,
          seriesTitle: foundSeries?.title || ep.title,
          seriesObj: foundSeries,
          episodes: [],
        });
      }

      const currentGroup = groupsMap.get(key)!;
      // Deduplicate episode inside group!
      const existingIdx = currentGroup.episodes.findIndex(item => {
        if (item.id === ep.id) return true;
        if (item.path && item.path.toLowerCase() === ep.path?.toLowerCase()) return true;
        const sMatch = (item.seasonNumber ?? 0) === (ep.seasonNumber ?? 0);
        const eMatch = (item.episodeNumber ?? 0) === (ep.episodeNumber ?? 0);
        return sMatch && eMatch;
      });

      if (existingIdx >= 0) {
        const prevEp = currentGroup.episodes[existingIdx];
        if ((ep.status === 'completed' && prevEp.status !== 'completed') || (!prevEp.path && ep.path)) {
          currentGroup.episodes[existingIdx] = ep;
        }
      } else {
        currentGroup.episodes.push(ep);
      }
    }

    const result = Array.from(groupsMap.values());
    sortGroupsEpisodes(result);
    return result;
  }, [localDownloadList, series]);

  const isEmpty = localDownloadList.length === 0 && serverQueueList.length === 0;

  return (
    <div className="downloads-view">
      <h2>Gestionnaire de téléchargements</h2>

      {isEmpty ? (
        <p className="loading-state">Aucun téléchargement en cours.</p>
      ) : (
        <>
          {/* Server Downloads (Unified Radarr & Sonarr) */}
          {serverQueueList.length > 0 && (
            <div className="downloads-section">
              <h3 className="downloads-section-title">
                Téléchargements sur le serveur
                <Badge variant="server">{serverQueueList.length}</Badge>
              </h3>
              <div className="downloads-list">
                {/* Server Movies */}
                {serverMovies.map(queueItem => {
                  const movie = movies.find(m => m.id === queueItem.mediaId);
                  const title = queueItem.title;
                  const posterUrl = movie ? getImageUrl(movie, 'poster') : null;
                  const progress =
                    queueItem.size > 0
                      ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
                      : 0;
                  const downloaded = queueItem.size - queueItem.sizeleft;
                  const sizeStr = `${formatSize(downloaded)} / ${formatSize(queueItem.size)}`;
                  const isClickable = !!movie;

                  const handleServerMovieClick = () => {
                    if (movie && onSelectMovie) onSelectMovie(movie);
                  };

                  const posterEl = posterUrl ? (
                    <img src={posterUrl} alt="" className="dl-poster" />
                  ) : (
                    <div className="dl-poster dl-poster--placeholder">
                      <Film size={18} />
                    </div>
                  );

                  return (
                    <div
                      key={queueItem.id}
                      className="download-item"
                    >
                      {isClickable ? (
                        <button
                          type="button"
                          className="dl-poster-btn"
                          onClick={handleServerMovieClick}
                          title="Cliquer pour voir les détails"
                        >
                          {posterEl}
                        </button>
                      ) : (
                        posterEl
                      )}

                      <div className="dl-main">
                        <div className="dl-header-row">
                          {isClickable ? (
                            <button
                              type="button"
                              className="dl-title-btn"
                              onClick={handleServerMovieClick}
                              title="Cliquer pour voir les détails"
                            >
                              <h4 title={title}>{title}</h4>
                            </button>
                          ) : (
                            <h4 title={title}>{title}</h4>
                          )}
                          <div className="dl-actions">
                            <span className="dl-percentage dl-percentage--server">{progress}%</span>
                            {onCancelServerQueue && (
                              <IconButton
                                icon={<X size={15} />}
                                variant="danger"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  onCancelServerQueue(queueItem);
                                }}
                                title="Annuler le téléchargement sur le serveur"
                                aria-label="Annuler le téléchargement sur le serveur"
                              />
                            )}
                          </div>
                        </div>

                        <div className="dl-progress-row">
                          <ProgressBar value={progress} variant="server" size="md" />
                        </div>

                        <div className="dl-meta-row">
                          <span className="dl-stats">
                            <span>{sizeStr}</span>
                            {queueItem.timeleft && <span className="dl-separator">•</span>}
                            {queueItem.timeleft && <span>Temps restant : {queueItem.timeleft}</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Server Series (Grouped by series into a single block) */}
                {serverSeriesGroups.map(group => {
                  return (
                    <div key={`server-series-${group.seriesId || group.seriesTitle}`} className="download-series-group">
                      <SeriesGroupHeader
                        seriesObj={group.seriesObj}
                        seriesTitle={group.seriesTitle}
                        episodeCount={group.episodes.length}
                        onSelectSeries={onSelectSeries}
                      />

                      <div className="download-series-episodes">
                        {group.episodes.map(ep => {
                          const progress =
                            ep.size > 0
                              ? Math.round(((ep.size - ep.sizeleft) / ep.size) * 100)
                              : 0;
                          const downloaded = ep.size - ep.sizeleft;
                          const sizeStr = `${formatSize(downloaded)} / ${formatSize(ep.size)}`;
                          const sNum = ep.seasonNumber ?? 1;
                          const eNum = ep.episodeNumber ?? 1;
                          const epTitle = getEpisodeDisplayTitle(ep.subTitle, ep.episodeNumber);
                          const hasSpecificTitle = epTitle && epTitle.toLowerCase() !== `épisode ${eNum}`.toLowerCase();
                          const subText = hasSpecificTitle ? `Saison ${sNum}, épisode ${eNum}` : `Saison ${sNum}`;

                          return (
                            <div key={ep.id} className="download-series-ep-row">
                              <div className="dl-ep-main">
                                <div className="dl-ep-header-row">
                                  <div className="dl-ep-title-group">
                                    <span className="dl-ep-title" title={epTitle}>
                                      {epTitle}
                                    </span>
                                    <span className="dl-ep-sub">{subText}</span>
                                  </div>
                                  <div className="dl-ep-actions">
                                    <span className="dl-percentage dl-percentage--server">{progress}%</span>
                                    {onCancelServerQueue && (
                                      <IconButton
                                        icon={<X size={15} />}
                                        variant="danger"
                                        size="sm"
                                        onClick={() => onCancelServerQueue(ep)}
                                        title="Annuler le téléchargement sur le serveur"
                                        aria-label="Annuler le téléchargement sur le serveur"
                                      />
                                    )}
                                  </div>
                                </div>

                                <div className="dl-ep-progress-row">
                                  <ProgressBar value={progress} variant="server" size="md" />
                                </div>

                                <div className="dl-ep-meta-row">
                                  <span className="dl-ep-stats">
                                    <span>{sizeStr}</span>
                                    {ep.timeleft && <span className="dl-separator">•</span>}
                                    {ep.timeleft && <span>{ep.timeleft}</span>}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Local Downloads */}
          <div className="downloads-section">
            {serverQueueList.length > 0 && (
              <h3 className="downloads-section-title">
                Téléchargements locaux
                {localDownloadList.length > 0 && (
                  <Badge variant="accent">{localDownloadList.length}</Badge>
                )}
              </h3>
            )}

            {localDownloadList.length === 0 && serverQueueList.length > 0 ? (
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  margin: '10px 0',
                }}
              >
                Aucun téléchargement local.
              </p>
            ) : (
              <div className="downloads-list">
                {/* Local Movies */}
                {localMovies.map(dl => {
                  const movie = movies.find(m => m.id === dl.mediaId);
                  return (
                    <DownloadItem
                      key={dl.id}
                      download={dl}
                      movie={movie}
                      onSelectMovie={onSelectMovie}
                      onPause={onPause}
                      onResume={onResume}
                      onPlay={onPlay}
                      onDelete={onDelete}
                    />
                  );
                })}

                {/* Local Series (Grouped by series into a single block) */}
                {localSeriesGroups.map(group => {
                  return (
                    <div key={`local-series-${group.seriesId || group.seriesTitle}`} className="download-series-group">
                      <SeriesGroupHeader
                        seriesObj={group.seriesObj}
                        seriesTitle={group.seriesTitle}
                        episodeCount={group.episodes.length}
                        onSelectSeries={onSelectSeries}
                      />

                      <div className="download-series-episodes">
                        {group.episodes.map(dl => {
                          const isCompleted = dl.status === 'completed';
                          const isDownloading = dl.status === 'downloading';
                          const isPaused = dl.status === 'paused';
                          const sNum = dl.seasonNumber ?? 1;
                          const eNum = dl.episodeNumber ?? 1;
                          const epTag = getEpisodeTag(dl.seasonNumber, dl.episodeNumber);
                          const epTitle = getEpisodeDisplayTitle(dl.subTitle, dl.episodeNumber);
                          const hasSpecificTitle = epTitle && epTitle.toLowerCase() !== `épisode ${eNum}`.toLowerCase();
                          const subText = hasSpecificTitle ? `Saison ${sNum}, épisode ${eNum}` : `Saison ${sNum}`;

                          return (
                            <div key={dl.id} className="download-series-ep-row">
                              <div className="dl-ep-main">
                                <div className="dl-ep-header-row">
                                  <div className="dl-ep-title-group">
                                    <span className="dl-ep-title" title={epTitle}>
                                      {epTitle}
                                    </span>
                                    <span className="dl-ep-sub">{subText}</span>
                                  </div>

                                  <div className="dl-ep-actions">
                                    {!isCompleted && (
                                      <span className="dl-percentage dl-percentage--local">
                                        {dl.progress}%
                                      </span>
                                    )}

                                    {isDownloading && (
                                      <>
                                        <IconButton
                                          icon={<Pause size={15} fill="currentColor" />}
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onPause(dl.id)}
                                          title="Pause"
                                          aria-label="Mettre en pause"
                                        />
                                        <IconButton
                                          icon={<X size={15} />}
                                          variant="danger"
                                          size="sm"
                                          onClick={() => onDelete(dl.id, false)}
                                          title="Annuler le téléchargement"
                                          aria-label="Annuler le téléchargement"
                                        />
                                      </>
                                    )}

                                    {isPaused && (
                                      <>
                                        <IconButton
                                          icon={<Play size={15} fill="currentColor" />}
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onResume(dl.id)}
                                          title="Reprendre"
                                          aria-label="Reprendre le téléchargement"
                                        />
                                        <IconButton
                                          icon={<X size={15} />}
                                          variant="danger"
                                          size="sm"
                                          onClick={() => onDelete(dl.id, false)}
                                          title="Annuler le téléchargement"
                                          aria-label="Annuler le téléchargement"
                                        />
                                      </>
                                    )}

                                    {isCompleted && dl.path && (
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        leftIcon={<Play size={15} fill="currentColor" />}
                                        onClick={() => onPlay(dl.path!, `${group.seriesTitle} ${epTag}`)}
                                      >
                                        Lancer
                                      </Button>
                                    )}

                                    {isCompleted && (
                                      <IconButton
                                        icon={<Trash2 size={15} />}
                                        variant="danger"
                                        size="sm"
                                        onClick={() =>
                                          setDeleteConfirmTarget({
                                            id: dl.id,
                                            title: group.seriesTitle,
                                            subTitle: epTitle,
                                            isCompleted: true,
                                          })
                                        }
                                        title="Supprimer du disque"
                                        aria-label="Supprimer du disque local"
                                      />
                                    )}
                                  </div>
                                </div>

                                {!isCompleted && (
                                  <div className="dl-ep-progress-row">
                                    <ProgressBar
                                      value={dl.progress}
                                      isPaused={isPaused}
                                      size="md"
                                    />
                                  </div>
                                )}

                                <div className="dl-ep-meta-row">
                                  {isCompleted ? (
                                    <span className="dl-ep-stats dl-stats--completed">
                                      <span>{dl.stats || 'Sur le disque'}</span>
                                    </span>
                                  ) : (
                                    <span className="dl-ep-stats">
                                      <span>{dl.sizeStr || dl.stats}</span>
                                      {isDownloading && dl.speed && <span className="dl-separator">•</span>}
                                      {isDownloading && dl.speed && <span>{dl.speed}</span>}
                                      {isDownloading && dl.timeRemaining && <span className="dl-separator">•</span>}
                                      {isDownloading && dl.timeRemaining && <span>Reste {dl.timeRemaining}</span>}
                                      {isPaused && <span className="dl-separator">•</span>}
                                      {isPaused && <span className="dl-paused-label">En pause</span>}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal for completed local series episodes */}
      <ConfirmModal
        isOpen={!!deleteConfirmTarget}
        title="Supprimer le téléchargement"
        message={
          deleteConfirmTarget ? (
            <>
              Voulez-vous vraiment supprimer{' '}
              <strong>
                {deleteConfirmTarget.title}
                {deleteConfirmTarget.subTitle ? ` (${deleteConfirmTarget.subTitle})` : ''}
              </strong>{' '}
              de votre disque local&nbsp;?
            </>
          ) : ''
        }
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmTarget) {
            onDelete(deleteConfirmTarget.id, true);
            setDeleteConfirmTarget(null);
          }
        }}
        onClose={() => setDeleteConfirmTarget(null)}
      />
    </div>
  );
}

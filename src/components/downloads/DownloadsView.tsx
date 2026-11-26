import { useState, useMemo } from 'react';
import { Pause, Play, Trash2, X } from 'lucide-react';
import { DownloadInfo, Movie, Series, UnifiedQueueItem } from '../../types';
import { getImageUrl } from '../../utils/media';
import { Button, type TransferState } from '../ui';
import { ConfirmModal } from '../common/ConfirmModal';
import { DownloadItem } from './DownloadItem';
import { DownloadAction, DownloadRow, DownloadThumb } from './DownloadRow';
import { PresenceList, type PresenceItem } from './PresenceList';
import { SeriesGroup } from './SeriesGroup';
import { describeLocalDownload, describeServerItem } from './transferDetails';

export interface DownloadsViewProps {
  readonly downloads: Record<string, DownloadInfo>;
  readonly serverQueueList: UnifiedQueueItem[];
  readonly movies: Movie[];
  readonly series: Series[];
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly onPlay: (path: string, title?: string) => void;
  readonly onDelete: (id: string, deleteFromDisk: boolean) => void;
  readonly onCancelServerQueue?: (item: UnifiedQueueItem) => void;
  /** `trigger`: the row, which takes the focus back when the movie page closes */
  readonly onSelectMovie?: (movie: Movie, trigger?: HTMLElement) => void;
  /** `trigger`: the row, which takes the focus back when the series page closes */
  readonly onSelectSeries?: (series: Series, trigger?: HTMLElement) => void;
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

/** Title of an episode row and the grey line that places it in the series. */
function describeEpisode(item: { subTitle?: string; seasonNumber?: number; episodeNumber?: number }) {
  const sNum = item.seasonNumber ?? 1;
  const eNum = item.episodeNumber ?? 1;
  const title = getEpisodeDisplayTitle(item.subTitle, item.episodeNumber) || `Épisode ${eNum}`;
  const hasSpecificTitle = title.toLowerCase() !== `épisode ${eNum}`.toLowerCase();
  const place = hasSpecificTitle ? `Saison ${sNum}, épisode ${eNum}` : `Saison ${sNum}`;
  return { title, place };
}

function countEpisodes(count: number): string {
  return `${count} épisode${count > 1 ? 's' : ''}`;
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

/** Whole local group: average of the episodes still moving; none when all are on disk. */
function localGroupProgress(episodes: DownloadInfo[]): { progress?: number; state: TransferState; active: number } {
  const moving = episodes.filter(ep => ep.status !== 'completed');
  if (moving.length === 0) return { state: 'active', active: 0 };
  const progress = moving.reduce((sum, ep) => sum + (ep.progress || 0), 0) / moving.length;
  let state: TransferState = 'paused';
  if (moving.some(ep => ep.status === 'downloading')) state = 'active';
  else if (moving.some(ep => ep.status === 'error')) state = 'error';
  return { progress, state, active: moving.length };
}

/** Whole server group: bytes received over bytes expected; waiting while nothing came in. */
function serverGroupProgress(episodes: UnifiedQueueItem[]): number | null {
  const size = episodes.reduce((sum, ep) => sum + Math.max(0, ep.size), 0);
  const received = episodes.reduce((sum, ep) => sum + Math.max(0, ep.size - ep.sizeleft), 0);
  return size > 0 && received > 0 ? (received / size) * 100 : null;
}

interface SectionHeadingProps {
  readonly id: string;
  readonly title: string;
  readonly count: number;
}

function SectionHeading({ id, title, count }: Readonly<SectionHeadingProps>) {
  return (
    <h3
      className="downloads-section-title"
      id={id}
      aria-label={count > 0 ? `${title}, ${count} téléchargement${count > 1 ? 's' : ''}` : undefined}
    >
      <span>{title}</span>
      {count > 0 && (
        <span className="downloads-section-count" aria-hidden="true">
          {count}
        </span>
      )}
    </h3>
  );
}

/**
 * Downloads page: what is on this computer (to play, or still coming), then what the
 * server is still fetching. One grouped list per section, a row per movie, a disclosure
 * row per series with its episodes under it.
 */
export function DownloadsView(props: Readonly<DownloadsViewProps>) {
  const {
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
  } = props;
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
    const groupsMap = new Map<string, { key: string; seriesId?: number; seriesTitle: string; seriesObj?: Series; episodes: UnifiedQueueItem[] }>();

    for (const ep of episodes) {
      const { foundSeries, canonicalSeriesId, key } = resolveSeriesForEpisode(ep, series);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
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
    const groupsMap = new Map<string, { key: string; seriesId?: number; seriesTitle: string; seriesObj?: Series; episodes: DownloadInfo[] }>();

    for (const ep of episodes) {
      const { foundSeries, canonicalSeriesId, key } = resolveSeriesForEpisode(ep, series);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
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

  const renderLocalEpisode = (dl: DownloadInfo, seriesTitle: string): PresenceItem => {
    const isCompleted = dl.status === 'completed';
    const isDownloading = dl.status === 'downloading';
    const canResume = dl.status === 'paused' || dl.status === 'error';
    const { title, place } = describeEpisode(dl);
    const view = describeLocalDownload(dl);
    const epTag = getEpisodeTag(dl.seasonNumber, dl.episodeNumber);

    const actions = isCompleted ? (
      <>
        {dl.path && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Play size={14} fill="currentColor" aria-hidden="true" />}
            onClick={() => onPlay(dl.path!, `${seriesTitle} ${epTag}`)}
            aria-label={`Lancer ${title}`}
          >
            Lancer
          </Button>
        )}
        <DownloadAction
          label="Supprimer de cet ordinateur"
          icon={<Trash2 size={16} aria-hidden="true" />}
          onClick={() => setDeleteConfirmTarget({ id: dl.id, title: seriesTitle, subTitle: title, isCompleted: true })}
          destructive
        />
      </>
    ) : (
      <>
        {isDownloading && (
          <DownloadAction
            label="Mettre en pause"
            icon={<Pause size={16} aria-hidden="true" />}
            onClick={() => onPause(dl.id)}
          />
        )}
        {canResume && (
          <DownloadAction
            label="Reprendre le téléchargement"
            icon={<Play size={16} aria-hidden="true" />}
            onClick={() => onResume(dl.id)}
          />
        )}
        <DownloadAction
          label="Annuler le téléchargement"
          icon={<X size={16} aria-hidden="true" />}
          onClick={() => onDelete(dl.id, false)}
          destructive
        />
      </>
    );

    return {
      key: dl.id,
      node: (
        <DownloadRow
          variant="episode"
          title={title}
          prefix={place}
          status={view.status}
          details={view.figures}
          progress={view.progress}
          state={view.state}
          actions={actions}
        />
      ),
    };
  };

  const renderServerEpisode = (ep: UnifiedQueueItem): PresenceItem => {
    const { title, place } = describeEpisode(ep);
    const view = describeServerItem(ep);
    return {
      key: ep.id,
      node: (
        <DownloadRow
          variant="episode"
          title={title}
          prefix={place}
          status={view.status}
          details={view.figures}
          progress={view.progress}
          state={view.state}
          actions={
            onCancelServerQueue && (
              <DownloadAction
                label="Annuler le téléchargement sur le serveur"
                icon={<X size={16} aria-hidden="true" />}
                onClick={() => onCancelServerQueue(ep)}
                destructive
              />
            )
          }
        />
      ),
    };
  };

  const localItems: PresenceItem[] = [
    ...localMovies.map(dl => ({
      key: dl.id,
      node: (
        <DownloadItem
          download={dl}
          movie={movies.find(m => m.id === dl.mediaId)}
          onSelectMovie={onSelectMovie}
          onPause={onPause}
          onResume={onResume}
          onPlay={onPlay}
          onDelete={onDelete}
        />
      ),
    })),
    ...localSeriesGroups.map(group => {
      const { progress, state, active } = localGroupProgress(group.episodes);
      const count = group.episodes.length;
      const details = [countEpisodes(count)];
      if (active > 0 && active < count) details.push(`${active} en cours`);
      return {
        key: `local-${group.key}`,
        node: (
          <SeriesGroup
            seriesTitle={group.seriesTitle}
            seriesObj={group.seriesObj}
            onSelectSeries={onSelectSeries}
            episodes={group.episodes.map(dl => renderLocalEpisode(dl, group.seriesTitle))}
            details={details}
            progress={progress}
            state={state}
            defaultOpen={active > 0}
          />
        ),
      };
    }),
  ];

  const serverItems: PresenceItem[] = [
    ...serverMovies.map(queueItem => {
      const movie = movies.find(m => m.id === queueItem.mediaId);
      const view = describeServerItem(queueItem);
      return {
        key: queueItem.id,
        node: (
          <DownloadRow
            title={queueItem.title}
            status={view.status}
            details={view.figures}
            progress={view.progress}
            state={view.state}
            leading={<DownloadThumb src={movie ? getImageUrl(movie, 'poster') : null} kind="movie" />}
            onOpen={movie && onSelectMovie ? trigger => onSelectMovie(movie, trigger) : undefined}
            openLabel="Voir la fiche du film"
            movieId={movie && onSelectMovie ? movie.id : undefined}
            actions={
              onCancelServerQueue && (
                <DownloadAction
                  label="Annuler le téléchargement sur le serveur"
                  icon={<X size={16} aria-hidden="true" />}
                  onClick={() => onCancelServerQueue(queueItem)}
                  destructive
                />
              )
            }
          />
        ),
      };
    }),
    ...serverSeriesGroups.map(group => ({
      key: `server-${group.key}`,
      node: (
        <SeriesGroup
          seriesTitle={group.seriesTitle}
          seriesObj={group.seriesObj}
          onSelectSeries={onSelectSeries}
          episodes={group.episodes.map(renderServerEpisode)}
          details={[countEpisodes(group.episodes.length)]}
          progress={serverGroupProgress(group.episodes)}
          defaultOpen
        />
      ),
    })),
  ];

  return (
    <div className="downloads-view">
      {isEmpty ? (
        <div className="downloads-empty">
          <p className="downloads-empty-title">Aucun téléchargement</p>
          <p className="downloads-empty-detail">
            Les films et les épisodes que vous téléchargez apparaissent ici, avec ceux que le serveur
            est en train de récupérer.
          </p>
        </div>
      ) : (
        <>
          <section className="downloads-section" aria-labelledby="downloads-local-title">
            <SectionHeading id="downloads-local-title" title="Sur cet ordinateur" count={localDownloadList.length} />
            {localItems.length === 0 ? (
              <p className="downloads-section-empty">Rien n’est encore téléchargé sur cet ordinateur.</p>
            ) : (
              <PresenceList items={localItems} className="dl-list" />
            )}
          </section>

          {serverItems.length > 0 && (
            <section className="downloads-section" aria-labelledby="downloads-server-title">
              <SectionHeading id="downloads-server-title" title="Sur le serveur" count={serverQueueList.length} />
              <PresenceList items={serverItems} className="dl-list" />
            </section>
          )}
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

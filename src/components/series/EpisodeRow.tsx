import type { ReactNode } from 'react';
import { CloudDownload, Download, HardDrive, Loader2, Pause, Play, Trash2, X } from 'lucide-react';
import type { DownloadInfo, Episode, Series, UnifiedQueueItem } from '../../types';
import { getEpisodeDownloadRelativePath } from '../../services/downloads';
import { formatDuration, formatSize } from '../../utils/formatters';
import { describeEpisodeAbsence, getEpisodeAbsence } from '../../utils/series';
import { DownloadAction, DownloadRow } from '../downloads/DownloadRow';
import { describeLocalDownload, describeServerItem, type TransferView } from '../downloads/transferDetails';

export interface ServerEpisodeDeleteTarget {
  readonly episodeFileId: number;
  readonly title: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
}

interface EpisodeRowProps {
  readonly episode: Episode;
  readonly series: Series;
  readonly download?: DownloadInfo;
  readonly queueItem?: UnifiedQueueItem;
  /** Search just sent to Sonarr: "Téléchargement lancé" for a few seconds */
  readonly justSearched: boolean;
  readonly isSearching: boolean;
  readonly onPlay: (episode: Episode) => void;
  readonly onDownload: (series: Series, episode: Episode) => void;
  readonly onPause: (id: string) => void;
  readonly onDelete: (id: string, deleteFromDisk: boolean, fallbackFilename?: string) => void;
  readonly onCancelServerQueue?: (item: UnifiedQueueItem) => void;
  readonly onSearch: (episodeId: number) => void;
  /** Asks for a confirmation before the local file goes */
  readonly onAskDeleteLocal: (downloadId: string) => void;
  /** Asks for a confirmation before the file leaves the server */
  readonly onAskDeleteServer: (target: ServerEpisodeDeleteTarget) => void;
}

/**
 * One episode of a season, on the rows of the downloads page: number, title, summary,
 * grey figures, a thin bar while something is moving and round buttons at the end. When
 * the episode can be played, the whole row plays it (the number turns into a play icon).
 */
export function EpisodeRow({
  episode,
  series,
  download,
  queueItem,
  justSearched,
  isSearching,
  onPlay,
  onDownload,
  onPause,
  onDelete,
  onCancelServerQueue,
  onSearch,
  onAskDeleteLocal,
  onAskDeleteServer,
}: Readonly<EpisodeRowProps>) {
  const epKey = `episode-${episode.id}`;
  const isLocal = download?.status === 'completed' && !!download.path;
  const isServer = episode.hasFile && !!episode.episodeFile;
  const isPlayable = isLocal || isServer;
  const isDownloading = download?.status === 'downloading';
  const canResume = download?.status === 'paused' || download?.status === 'error';
  const hasLocalTransfer = isDownloading || canResume;
  const title = episode.title || `Épisode ${episode.episodeNumber}`;
  const cancelFilename = getEpisodeDownloadRelativePath(series, episode);

  // What is moving, if anything: this computer first, then the server
  let transfer: TransferView | null = null;
  if (download && hasLocalTransfer) transfer = describeLocalDownload(download);
  else if (queueItem) transfer = describeServerItem(queueItem);

  // Not on the server and nothing on its way: toned down, with the reason in grey
  const absence = isPlayable || transfer ? null : getEpisodeAbsence({ ...episode, hasFile: false }, !!queueItem);

  let status = transfer?.status;
  let statusIcon: ReactNode;
  let figures = transfer?.figures;
  if (!transfer) {
    if (isLocal) {
      status = 'Sur cet ordinateur';
      statusIcon = <HardDrive className="dl-row-status-icon" size={14} aria-hidden="true" />;
    } else if (absence) {
      status = describeEpisodeAbsence(absence, episode.airDateUtc);
    }
    figures = [
      episode.runtime ? formatDuration(episode.runtime) : '',
      episode.episodeFile?.size ? formatSize(episode.episodeFile.size) : '',
    ].filter(Boolean);
  }

  const cancelLocal = (
    <DownloadAction
      label="Annuler le téléchargement"
      icon={<X size={16} aria-hidden="true" />}
      onClick={() => onDelete(epKey, true, cancelFilename)}
      destructive
    />
  );

  let actions: ReactNode;
  if (isLocal) {
    actions = (
      <DownloadAction
        label="Supprimer l’épisode de cet ordinateur"
        icon={<Trash2 size={16} aria-hidden="true" />}
        onClick={() => onAskDeleteLocal(epKey)}
        destructive
      />
    );
  } else if (isDownloading) {
    actions = (
      <>
        <DownloadAction
          label="Mettre en pause"
          icon={<Pause size={16} aria-hidden="true" />}
          onClick={() => onPause(epKey)}
        />
        {cancelLocal}
      </>
    );
  } else if (canResume) {
    actions = (
      <>
        <DownloadAction
          label="Reprendre le téléchargement"
          icon={<Play size={16} aria-hidden="true" />}
          onClick={() => onDownload(series, episode)}
        />
        {cancelLocal}
      </>
    );
  } else if (isServer) {
    actions = (
      <>
        <DownloadAction
          label="Télécharger sur cet ordinateur"
          icon={<Download size={16} aria-hidden="true" />}
          onClick={() => onDownload(series, episode)}
        />
        <DownloadAction
          label="Supprimer du serveur"
          icon={<Trash2 size={16} aria-hidden="true" />}
          onClick={() =>
            onAskDeleteServer({
              episodeFileId: episode.episodeFile?.id ?? 0,
              title,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
            })
          }
          destructive
        />
      </>
    );
  } else if (queueItem) {
    actions = onCancelServerQueue && (
      <DownloadAction
        label="Annuler le téléchargement sur le serveur"
        icon={<X size={16} aria-hidden="true" />}
        onClick={() => onCancelServerQueue(queueItem)}
        destructive
      />
    );
  } else if (justSearched) {
    actions = (
      <span className="episode-launched" role="status">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Téléchargement lancé
      </span>
    );
  } else {
    actions = (
      <DownloadAction
        label="Télécharger cet épisode sur le serveur"
        icon={
          isSearching ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudDownload size={16} aria-hidden="true" />
          )
        }
        onClick={() => onSearch(episode.id)}
        busy={isSearching}
      />
    );
  }

  return (
    <DownloadRow
      title={title}
      description={episode.overview}
      status={status}
      statusIcon={statusIcon}
      dimmed={absence !== null}
      details={figures}
      progress={transfer?.progress}
      state={transfer?.state}
      leading={
        <span className="episode-index">
          <span className="episode-index-number">
            <span className="sr-only">Épisode </span>
            {String(episode.episodeNumber).padStart(2, '0')}
          </span>
          {isPlayable && <Play className="episode-index-play" size={16} fill="currentColor" aria-hidden="true" />}
        </span>
      }
      onOpen={isPlayable ? () => onPlay(episode) : undefined}
      openLabel={isLocal ? 'Lancer l’épisode sur cet ordinateur' : 'Lire en streaming'}
      openAccessibleName={`Lancer ${title}`}
      actions={actions}
    />
  );
}

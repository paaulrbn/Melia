import type { DownloadInfo, UnifiedQueueItem } from '../../types';
import { formatSize } from '../../utils/formatters';
import { formatTimeLeft, parseLocalTimeLeft, parseQueueTimeLeft } from '../../utils/transfer';
import type { TransferState } from '../ui';

export interface TransferView {
  /** Word for the state ("En pause", "Interrompu"), shown first */
  readonly status?: string;
  /** Figures: sizes, speed, time left */
  readonly figures: string[];
  /** Percentage, null while waiting, undefined when finished (no bar) */
  readonly progress?: number | null;
  readonly state: TransferState;
}

/** "2,1 Go sur 14,6 Go" from "2,1 Go / 14,6 Go"; nothing when the text is a state word. */
function localSizes(download: DownloadInfo): string {
  const raw = download.sizeStr || (download.stats.includes(' / ') ? download.stats : '');
  return raw.replace(' / ', ' sur ');
}

export function describeLocalDownload(download: DownloadInfo): TransferView {
  const sizes = localSizes(download);

  switch (download.status) {
    case 'completed':
      return { figures: [download.stats || 'Sur cet ordinateur'], state: 'active' };
    case 'paused':
      return { status: 'En pause', figures: [sizes].filter(Boolean), progress: download.progress || 0, state: 'paused' };
    case 'error':
      return { status: 'Interrompu', figures: [sizes].filter(Boolean), progress: download.progress || 0, state: 'error' };
    default: {
      // Just started, no figure yet: a moving bar instead of an empty one
      if (!sizes && !download.progress) return { status: 'Démarrage', figures: [], progress: null, state: 'active' };
      return {
        figures: [sizes, download.speed ?? '', formatTimeLeft(parseLocalTimeLeft(download.timeRemaining))].filter(
          Boolean
        ),
        progress: download.progress || 0,
        state: 'active',
      };
    }
  }
}

export function describeServerItem(item: UnifiedQueueItem): TransferView {
  const downloaded = Math.max(0, item.size - item.sizeleft);
  // Nothing received yet: "En attente" and a sober moving bar, not an empty one
  if (!(item.size > 0 && downloaded > 0)) return { status: 'En attente', figures: [], progress: null, state: 'active' };
  return {
    figures: [
      `${formatSize(downloaded)} sur ${formatSize(item.size)}`,
      formatTimeLeft(parseQueueTimeLeft(item.timeleft)),
    ].filter(Boolean),
    progress: (downloaded / item.size) * 100,
    state: 'active',
  };
}

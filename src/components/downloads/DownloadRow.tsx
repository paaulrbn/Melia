import { useId, type ReactNode } from 'react';
import { Film, Tv } from 'lucide-react';
import { Poster, TransferBar, type TransferState } from '../ui';

interface DownloadThumbProps {
  readonly src: string | null;
  readonly kind: 'movie' | 'series';
}

/** Small poster; the icon stays behind while it loads, or when there is none. */
export function DownloadThumb({ src, kind }: Readonly<DownloadThumbProps>) {
  const Icon = kind === 'series' ? Tv : Film;
  return (
    <span className="dl-thumb" aria-hidden="true">
      <Icon className="dl-thumb-icon" size={18} />
      {src && <Poster className="dl-thumb-img" src={src} />}
    </span>
  );
}

interface DownloadActionProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
  /** Cancel, delete: red only under the pointer */
  readonly destructive?: boolean;
}

/** Round glass button of a row (pause, resume, cancel, delete), named for screen readers. */
export function DownloadAction({ label, icon, onClick, destructive = false }: Readonly<DownloadActionProps>) {
  return (
    <button
      type="button"
      className={`dl-action${destructive ? ' dl-action--destructive' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

export interface DownloadRowProps {
  readonly title: string;
  /** First grey item, before the state word (an episode's season and number) */
  readonly prefix?: string;
  /** State word before the figures ("En pause", "Interrompu", "En attente") */
  readonly status?: string;
  /** Grey figures under the title, spaced apart without separators */
  readonly details?: readonly ReactNode[];
  /** Percentage, null while waiting, undefined for no bar (finished) */
  readonly progress?: number | null;
  readonly state?: TransferState;
  /** Poster column; nothing for an episode (it aligns with the series title instead) */
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
  /** Whole row opens the movie page; receives the element that takes the focus back */
  readonly onOpen?: (trigger: HTMLElement) => void;
  readonly openLabel?: string;
  /** Lets the app find the row again to give it the focus back */
  readonly movieId?: number;
  readonly variant?: 'item' | 'episode';
}

/**
 * One download: poster, title, figures and thin bar, actions at the trailing edge.
 * When it opens a page, the title is a button stretched over the whole row; the actions
 * sit above it and stay separate tab stops.
 */
export function DownloadRow({
  title,
  prefix,
  status,
  details = [],
  progress,
  state = 'active',
  leading,
  actions,
  onOpen,
  openLabel,
  movieId,
  variant = 'item',
}: Readonly<DownloadRowProps>) {
  const titleId = useId();
  const detailId = useId();
  const visibleDetails = [
    prefix,
    status ? (
      <span className="dl-row-status" key="status">
        {status}
      </span>
    ) : null,
    ...details,
  ].filter(Boolean);

  return (
    <div className={`dl-row dl-row--${variant}${onOpen ? ' is-clickable' : ''}`} data-state={state}>
      {leading}
      <div className="dl-row-text">
        {onOpen ? (
          <button
            type="button"
            className="dl-row-title dl-row-hit"
            id={titleId}
            onClick={event => onOpen(event.currentTarget)}
            data-movie-id={movieId}
            aria-describedby={visibleDetails.length > 0 ? detailId : undefined}
            title={openLabel}
          >
            <span className="dl-row-title-text">{title}</span>
          </button>
        ) : (
          <p className="dl-row-title" id={titleId}>
            <span className="dl-row-title-text">{title}</span>
          </p>
        )}
        {visibleDetails.length > 0 && (
          <p className="dl-row-detail" id={detailId}>
            {visibleDetails.map((detail, index) =>
              typeof detail === 'string' ? <span key={index}>{detail}</span> : detail
            )}
          </p>
        )}
        {progress !== undefined && (
          <TransferBar className="dl-row-bar" value={progress} state={state} labelledBy={titleId} />
        )}
      </div>
      {actions && <div className="dl-row-actions">{actions}</div>}
    </div>
  );
}

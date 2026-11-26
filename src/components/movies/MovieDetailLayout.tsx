import type { ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { useImageStatus } from '../../hooks/useImageStatus';
import type { QualityProfile } from '../../types';
import { TransferBar, type TransferState } from '../ui';

interface QualityPickerProps {
  readonly profiles: QualityProfile[];
  readonly value: number | null | undefined;
  readonly onChange: (id: number) => void;
  readonly disabled?: boolean;
}

/**
 * Quality choice of the movie page: a glass capsule of the side actions' family, with
 * "Qualité" and the current value inside it. A real `<select>` lies over the capsule,
 * transparent, so the click opens the native macOS menu and screen readers get a
 * labelled list box.
 */
export function QualityPicker({ profiles, value, onChange, disabled = false }: Readonly<QualityPickerProps>) {
  const current = profiles.find(qp => qp.id === value);

  return (
    <div className="movie-detail-quiet movie-detail-quality" data-disabled={disabled ? '' : undefined}>
      <span className="movie-detail-quality-text" aria-hidden="true">
        <span className="movie-detail-quality-label">Qualité</span>
        <span className="movie-detail-quality-value">{current?.name ?? 'Choisir'}</span>
      </span>
      <ChevronsUpDown className="movie-detail-quality-chevron" size={16} aria-hidden="true" />
      <select
        className="movie-detail-quality-select"
        aria-label="Qualité"
        value={current ? current.id : ''}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        {!current && (
          <option value="" disabled>
            Choisir
          </option>
        )}
        {profiles.map(qp => (
          <option key={qp.id} value={qp.id}>
            {qp.name}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TransferStatusProps {
  /** Prefix of the element ids (heading of the block) */
  readonly id: string;
  /** One strong line; it changes only with the state, so it is announced politely */
  readonly title: string;
  /** Figures in grey (sizes, speed, time left), spaced apart without separators */
  readonly details: readonly string[];
  /** Percentage, or null while waiting (sober indeterminate bar) */
  readonly progress: number | null;
  readonly state?: TransferState;
  /** Round glass buttons (pause, resume, cancel) */
  readonly actions?: ReactNode;
}

/**
 * Download in progress (on the server or on this computer), in the place of the actions
 * row: no plate, a title and its figures like the other states of the page, a thin bar
 * the row's width and the round buttons of the delete button's family.
 */
export function TransferStatus({
  id,
  title,
  details,
  progress,
  state = 'active',
  actions,
}: Readonly<TransferStatusProps>) {
  const titleId = `${id}-title`;

  return (
    <section className="movie-detail-transfer" data-state={state} aria-labelledby={titleId}>
      <div className="movie-detail-transfer-head">
        <div className="movie-detail-transfer-text">
          <h3 className="movie-detail-transfer-title" id={titleId} aria-live="polite">
            {title}
          </h3>
          {details.length > 0 && (
            <p className="movie-detail-transfer-detail">
              {details.map((detail, index) => (
                <span key={index}>{detail}</span>
              ))}
            </p>
          )}
        </div>
        {actions && <div className="movie-detail-transfer-actions">{actions}</div>}
      </div>
      <TransferBar value={progress} state={state} labelledBy={titleId} />
    </section>
  );
}

/** Heading of the movie page: it takes the focus when the page opens. */
export const MOVIE_DETAIL_HEADING_ID = 'movie-detail-title';

interface MovieDetailLayoutProps {
  readonly title: string;
  readonly fanartUrl: string | null;
  readonly posterUrl: string | null;
  /** Line between the title and the facts (director's name); nothing when absent. */
  readonly credit?: ReactNode;
  /** `<li>` items: year, duration, size… */
  readonly facts: ReactNode;
  /** Main action, or what stands in for it */
  readonly primary: ReactNode;
  /** Status banners of the movies screen, above the summary */
  readonly notices?: ReactNode;
  readonly overview?: string;
  /** Dialogs of the page (confirmations) */
  readonly children?: ReactNode;
}

/**
 * Movie page, shown in the content area in place of the list: a backdrop header with the
 * poster, title, key facts and the main action, then the summary. Shared by the page of a
 * library movie and the page that adds a movie found by the search.
 */
export function MovieDetailLayout({
  title,
  fanartUrl,
  posterUrl,
  credit,
  facts,
  primary,
  notices,
  overview,
  children,
}: Readonly<MovieDetailLayoutProps>) {
  const backdropStatus = useImageStatus(fanartUrl);

  return (
    <article
      className={`movie-detail${posterUrl ? ' movie-detail--with-poster' : ''}`}
      aria-labelledby={MOVIE_DETAIL_HEADING_ID}
    >
      <header className="movie-detail-hero">
        {fanartUrl && backdropStatus !== 'error' && (
          <div
            className="movie-detail-backdrop"
            data-status={backdropStatus}
            style={{ backgroundImage: `url(${fanartUrl})` }}
            aria-hidden="true"
          />
        )}

        <div className="movie-detail-hero-inner">
          {posterUrl && <img className="movie-detail-poster" src={posterUrl} alt="" decoding="async" />}
          <div className="movie-detail-intro">
            <h2 className="movie-detail-title" id={MOVIE_DETAIL_HEADING_ID} tabIndex={-1}>
              {title}
            </h2>
            {credit && <p className="movie-detail-credit">{credit}</p>}
            <ul className="movie-detail-facts" aria-label="Informations">
              {facts}
            </ul>
            <div className="movie-detail-primary">{primary}</div>
          </div>
        </div>
      </header>

      <div className="movie-detail-body">
        {notices}
        <section className="movie-detail-section" aria-labelledby="movie-detail-overview-title">
          {/* Heading for screen readers only: on screen, the text speaks for itself */}
          <h3 className="sr-only" id="movie-detail-overview-title">
            Résumé
          </h3>
          <p className="movie-detail-overview">{overview || 'Aucun résumé disponible.'}</p>
        </section>
      </div>

      {children}
    </article>
  );
}

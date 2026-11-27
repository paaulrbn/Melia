import { useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { useImageStatus } from '../../hooks/useImageStatus';
import type { QualityProfile } from '../../types';
import { Poster, TransferBar, type TransferState } from '../ui';

interface QualityPickerProps {
  readonly profiles: QualityProfile[];
  readonly value: number | null | undefined;
  readonly onChange: (id: number) => void;
  readonly disabled?: boolean;
}

/**
 * Quality choice of a detail page: a glass capsule of the side actions' family, with
 * "Qualité" and the current value inside it. A real `<select>` lies over the capsule,
 * transparent, so the click opens the native macOS menu and screen readers get a
 * labelled list box.
 */
export function QualityPicker({ profiles, value, onChange, disabled = false }: Readonly<QualityPickerProps>) {
  const current = profiles.find(qp => qp.id === value);

  return (
    <div className="media-detail-quiet media-detail-quality" data-disabled={disabled ? '' : undefined}>
      <span className="media-detail-quality-text" aria-hidden="true">
        <span className="media-detail-quality-label">Qualité</span>
        <span className="media-detail-quality-value">{current?.name ?? 'Choisir'}</span>
      </span>
      <ChevronsUpDown className="media-detail-quality-chevron" size={16} aria-hidden="true" />
      <select
        className="media-detail-quality-select"
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
    <section className="media-detail-transfer" data-state={state} aria-labelledby={titleId}>
      <div className="media-detail-transfer-head">
        <div className="media-detail-transfer-text">
          <h3 className="media-detail-transfer-title" id={titleId} aria-live="polite">
            {title}
          </h3>
          {details.length > 0 && (
            <p className="media-detail-transfer-detail">
              {details.map((detail, index) => (
                <span key={index}>{detail}</span>
              ))}
            </p>
          )}
        </div>
        {actions && <div className="media-detail-transfer-actions">{actions}</div>}
      </div>
      <TransferBar value={progress} state={state} labelledBy={titleId} />
    </section>
  );
}

/** Heading of a detail page (movie or series): it takes the focus when the page opens. */
export const MEDIA_DETAIL_HEADING_ID = 'media-detail-title';

interface MediaDetailLayoutProps {
  readonly title: string;
  readonly fanartUrl: string | null;
  readonly posterUrl: string | null;
  /** Line between the title and the facts (director, network); nothing when absent. */
  readonly credit?: ReactNode;
  /** The credit is on its way: its line is kept empty, so nothing moves when it arrives */
  readonly isCreditLoading?: boolean;
  /** `<li>` items: year, duration, size… */
  readonly facts: ReactNode;
  /** Main action, or what stands in for it */
  readonly primary: ReactNode;
  /** Status banners of the screen, above the summary */
  readonly notices?: ReactNode;
  readonly overview?: string;
  /** Full-width content under the summary (the seasons and episodes of a series) */
  readonly sections?: ReactNode;
  /** Dialogs of the page (confirmations) */
  readonly children?: ReactNode;
}

/**
 * Detail page of a movie or a series, shown in the content area in place of the list: a
 * backdrop header with the poster, title, key facts and the main action, then the summary.
 * Shared by the page of a library item and the page that adds an item found by the search.
 */
export function MediaDetailLayout({
  title,
  fanartUrl,
  posterUrl,
  credit,
  isCreditLoading = false,
  facts,
  primary,
  notices,
  overview,
  sections,
  children,
}: Readonly<MediaDetailLayoutProps>) {
  const backdropStatus = useImageStatus(fanartUrl);
  // The credit fades in only when it arrives after the page opened; known at once, it is
  // simply there
  const [wasCreditPending] = useState(isCreditLoading);

  return (
    <article
      className={`media-detail${posterUrl ? ' media-detail--with-poster' : ''}`}
      aria-labelledby={MEDIA_DETAIL_HEADING_ID}
    >
      <header className="media-detail-hero">
        {fanartUrl && backdropStatus !== 'error' && (
          <div
            className="media-detail-backdrop"
            data-status={backdropStatus}
            style={{ backgroundImage: `url(${fanartUrl})` }}
            aria-hidden="true"
          />
        )}

        <div className="media-detail-hero-inner">
          {posterUrl && <Poster className="media-detail-poster" src={posterUrl} />}
          <div className="media-detail-intro">
            <h2 className="media-detail-title" id={MEDIA_DETAIL_HEADING_ID} tabIndex={-1}>
              {title}
            </h2>
            {credit ? (
              <p className={`media-detail-credit${wasCreditPending ? ' media-detail-credit--arrived' : ''}`}>
                {credit}
              </p>
            ) : (
              isCreditLoading && (
                <p className="media-detail-credit media-detail-credit--pending" aria-hidden="true">
                  {' '}
                </p>
              )
            )}
            <ul className="media-detail-facts" aria-label="Informations">
              {facts}
            </ul>
            <div className="media-detail-primary">{primary}</div>
          </div>
        </div>
      </header>

      <div className="media-detail-body">
        {notices}
        <section className="media-detail-section" aria-labelledby="media-detail-overview-title">
          {/* Heading for screen readers only: on screen, the text speaks for itself */}
          <h3 className="sr-only" id="media-detail-overview-title">
            Résumé
          </h3>
          <p className="media-detail-overview">{overview || 'Aucun résumé disponible.'}</p>
        </section>
        {sections && <div className="media-detail-wide">{sections}</div>}
      </div>

      {children}
    </article>
  );
}

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Series } from '../../types';
import { getImageUrl } from '../../utils/media';
import { TransferBar, type TransferState } from '../ui';
import { DownloadThumb } from './DownloadRow';
import { PresenceList, type PresenceItem } from './PresenceList';

interface SeriesGroupProps {
  readonly seriesTitle: string;
  readonly seriesObj?: Series;
  /** `trigger`: the title button, which takes the focus back when the series page closes */
  readonly onSelectSeries?: (series: Series, trigger?: HTMLElement) => void;
  readonly episodes: readonly PresenceItem[];
  /** Under the title: "3 épisodes", "1 en cours"… */
  readonly details: readonly string[];
  /** Progress of the whole series, null while waiting, undefined when nothing moves */
  readonly progress?: number | null;
  readonly state?: TransferState;
  /** Open on first render (something in progress) */
  readonly defaultOpen: boolean;
}

/**
 * Episodes of one series: the whole row opens the series page (title button stretched
 * over it, like a movie), the round chevron button alone shows or hides the episodes.
 * The list grows and folds through its height
 * (grid rows 0fr to 1fr) and is inert while closed.
 */
export function SeriesGroup({
  seriesTitle,
  seriesObj,
  onSelectSeries,
  episodes,
  details,
  progress,
  state = 'active',
  defaultOpen,
}: Readonly<SeriesGroupProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const detailId = useId();
  const panelId = useId();
  const posterUrl = seriesObj ? getImageUrl(seriesObj, 'poster') : null;
  const toggleLabel = open ? 'Masquer les épisodes' : 'Afficher les épisodes';

  // A series no longer in the library (still in the server queue) has no page to open
  const canOpen = seriesObj !== undefined && onSelectSeries !== undefined;

  return (
    <div className="dl-group" data-open={open ? 'true' : 'false'}>
      <div className={`dl-row dl-row--group${canOpen ? ' is-clickable' : ''}`} data-state={state}>
        <DownloadThumb src={posterUrl} kind="series" />
        <div className="dl-row-text">
          {canOpen ? (
            <button
              type="button"
              className="dl-row-title dl-row-hit"
              id={titleId}
              aria-describedby={details.length > 0 ? detailId : undefined}
              title="Voir la fiche de la série"
              data-series-id={seriesObj.id}
              onClick={event => onSelectSeries(seriesObj, event.currentTarget)}
            >
              <span className="dl-row-title-text">{seriesTitle}</span>
            </button>
          ) : (
            <p className="dl-row-title" id={titleId}>
              <span className="dl-row-title-text">{seriesTitle}</span>
            </p>
          )}
          {details.length > 0 && (
            <p className="dl-row-detail" id={detailId}>
              {details.map((detail, index) => (
                <span key={index}>{detail}</span>
              ))}
            </p>
          )}
          {progress !== undefined && (
            <TransferBar className="dl-row-bar" value={progress} state={state} labelledBy={titleId} />
          )}
        </div>
        <div className="dl-row-actions">
          <button
            type="button"
            className="dl-action dl-group-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => setOpen(value => !value)}
          >
            <ChevronDown className="dl-group-chevron" size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="dl-group-panel" id={panelId} inert={!open}>
        <div className="dl-group-panel-inner">
          <PresenceList items={episodes} className="dl-episodes" aria-label={`Épisodes de ${seriesTitle}`} />
        </div>
      </div>
    </div>
  );
}

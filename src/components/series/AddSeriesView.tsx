import type { ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { LookupSeries, QualityProfile } from '../../types';
import { getImageUrl } from '../../utils/media';
import { formatSeasonCount, getSeriesStatusText } from '../../utils/series';
import { MediaDetailLayout, QualityPicker } from '../media/MediaDetailLayout';

interface AddSeriesViewProps {
  readonly series: LookupSeries;
  readonly qualityProfiles: QualityProfile[];
  readonly selectedQuality: number | null;
  readonly setSelectedQuality: (id: number) => void;
  readonly isAdding: boolean;
  readonly error: string | null;
  /** Status banners of the series screen (server unreachable, failed action). */
  readonly notices?: ReactNode;
  readonly onAdd: () => void;
}

/**
 * Page of a series found by the search and not in the library yet: same layout as a
 * library series, with the quality and "Ajouter" in place of the play actions.
 */
export function AddSeriesView({
  series,
  qualityProfiles,
  selectedQuality,
  setSelectedQuality,
  isAdding,
  error,
  notices,
  onAdd,
}: Readonly<AddSeriesViewProps>) {
  const seasonCount = (series.seasons ?? []).filter(season => season.seasonNumber > 0).length;
  const statusText = getSeriesStatusText(series.status);

  let status = '';
  if (isAdding) status = 'Ajout en cours…';
  else if (error) status = `Ajout impossible : ${error}`;

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
        </>
      }
      primary={
        <div className="media-detail-add">
          {/* Main action first, quality next to it at the same height */}
          <div className="media-detail-actions media-detail-actions--add">
            <button
              type="button"
              className="media-detail-play"
              onClick={onAdd}
              disabled={isAdding || !selectedQuality}
              aria-busy={isAdding}
            >
              {isAdding ? (
                <Loader2 className="media-detail-play-icon animate-spin" size={22} aria-hidden="true" />
              ) : (
                <Plus className="media-detail-play-icon" size={22} aria-hidden="true" />
              )}
              Ajouter
            </button>
            {qualityProfiles.length > 0 && (
              <QualityPicker
                profiles={qualityProfiles}
                value={selectedQuality}
                onChange={setSelectedQuality}
                disabled={isAdding}
              />
            )}
          </div>

          {/* Always in the DOM so progress and errors are announced when they appear */}
          <p
            className={`media-detail-status${!isAdding && error ? ' media-detail-status--error' : ''}`}
            role="status"
          >
            {status}
          </p>
        </div>
      }
      notices={notices}
      overview={series.overview}
    />
  );
}

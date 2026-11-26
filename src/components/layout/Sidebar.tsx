import { useMemo, type ReactNode } from 'react';
import { Download, Film, Settings, Tv } from 'lucide-react';
import { TabType } from '../../types';
import { MovieGroup, MovieGroupKey } from '../../utils/movieGroups';
import { SeriesGroupKey, SeriesLibraryGroup } from '../../utils/seriesGroups';
import { LibraryGroupTree } from './LibraryGroupTree';

/** macOS sidebar icon size (medium rows), matches --sidebar-icon-size. */
const ICON_SIZE = 16;

interface SidebarProps {
  readonly id: string;
  /** Hidden: out of the layout and out of reach until the toggle shows it again. */
  readonly isCollapsed: boolean;
  readonly activeTab: TabType;
  readonly onSelectTab: (tab: TabType) => void;
  readonly activeDownloadCount: number;
  /** Library groups listed under "Films", on every screen. */
  readonly movieGroups: readonly MovieGroup[];
  /** Group being read on the movies screen; null elsewhere. */
  readonly activeMovieGroup: MovieGroupKey | null;
  readonly onSelectMovieGroup: (key: MovieGroupKey) => void;
  /** Library groups listed under "Séries", on every screen. */
  readonly seriesGroups: readonly SeriesLibraryGroup[];
  /** Group being read on the series screen; null elsewhere. */
  readonly activeSeriesGroup: SeriesGroupKey | null;
  readonly onSelectSeriesGroup: (key: SeriesGroupKey) => void;
}

interface NavItemProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly ariaLabel?: string;
  readonly trailing?: ReactNode;
}

function NavItem({ label, icon, isActive, onClick, ariaLabel, trailing }: Readonly<NavItemProps>) {
  return (
    <button
      type="button"
      className={`sidebar-link${isActive ? ' is-active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="sidebar-link-icon" aria-hidden="true">{icon}</span>
      <span className="sidebar-link-label">{label}</span>
      {trailing}
    </button>
  );
}

export function Sidebar({
  id,
  isCollapsed,
  activeTab,
  onSelectTab,
  activeDownloadCount,
  movieGroups,
  activeMovieGroup,
  onSelectMovieGroup,
  seriesGroups,
  activeSeriesGroup,
  onSelectSeriesGroup,
}: Readonly<SidebarProps>) {
  const hasActiveDownloads = activeDownloadCount > 0;
  const movieItems = useMemo(
    () => movieGroups.map(group => ({ key: group.key, title: group.title, count: group.movies.length })),
    [movieGroups]
  );
  const seriesItems = useMemo(
    () => seriesGroups.map(group => ({ key: group.key, title: group.title, count: group.series.length })),
    [seriesGroups]
  );

  return (
    <aside id={id} className={`sidebar${isCollapsed ? ' is-collapsed' : ''}`}>
      {/* Window drag area under the top row (traffic lights, logo, toggle) */}
      <div className="sidebar-top" data-tauri-drag-region="true" />

      <nav className="sidebar-nav" aria-label="Navigation principale">
        <ul className="sidebar-list">
          <li>
            <NavItem
              label="Films"
              icon={<Film size={ICON_SIZE} />}
              isActive={activeTab === 'movies'}
              onClick={() => onSelectTab('movies')}
            />
            {movieItems.length > 0 && (
              <LibraryGroupTree
                groups={movieItems}
                activeKey={activeMovieGroup}
                onSelect={onSelectMovieGroup}
                label="Groupes de films"
                noun={{ one: 'film', many: 'films' }}
              />
            )}
          </li>
          <li>
            <NavItem
              label="Séries"
              icon={<Tv size={ICON_SIZE} />}
              isActive={activeTab === 'series'}
              onClick={() => onSelectTab('series')}
            />
            {seriesItems.length > 0 && (
              <LibraryGroupTree
                groups={seriesItems}
                activeKey={activeSeriesGroup}
                onSelect={onSelectSeriesGroup}
                label="Groupes de séries"
                noun={{ one: 'série', many: 'séries' }}
              />
            )}
          </li>
          <li>
            <NavItem
              label="Téléchargements"
              icon={<Download size={ICON_SIZE} />}
              isActive={activeTab === 'downloads'}
              onClick={() => onSelectTab('downloads')}
              ariaLabel={
                hasActiveDownloads ? `Téléchargements, ${activeDownloadCount} en cours` : undefined
              }
              trailing={
                hasActiveDownloads && (
                  <span className="sidebar-link-count" aria-hidden="true">
                    {activeDownloadCount}
                  </span>
                )
              }
            />
          </li>
        </ul>

        <ul className="sidebar-list sidebar-list--bottom">
          <li>
            <NavItem
              label="Paramètres"
              icon={<Settings size={ICON_SIZE} />}
              isActive={activeTab === 'settings'}
              onClick={() => onSelectTab('settings')}
            />
          </li>
        </ul>
      </nav>
    </aside>
  );
}

import type { ReactNode } from 'react';
import { Download, Film, Settings, Tv } from 'lucide-react';
import { TabType } from '../../types';
import { MovieGroup, MovieGroupKey } from '../../utils/movieGroups';
import { Badge } from '../ui';

const ICON_SIZE = 18;

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
}: Readonly<SidebarProps>) {
  const hasActiveDownloads = activeDownloadCount > 0;

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
            {movieGroups.length > 0 && (
              <ul className="sidebar-sublist" aria-label="Groupes de films">
                {movieGroups.map(group => {
                  const count = group.movies.length;
                  const isCurrent = group.key === activeMovieGroup;
                  return (
                    <li key={group.key}>
                      <button
                        type="button"
                        className={`sidebar-sublink${isCurrent ? ' is-current' : ''}`}
                        aria-current={isCurrent ? 'true' : undefined}
                        aria-label={`${group.title}, ${count} ${count > 1 ? 'films' : 'film'}`}
                        onClick={() => onSelectMovieGroup(group.key)}
                      >
                        <span className="sidebar-sublink-label">{group.title}</span>
                        <span className="category-count">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
          <li>
            <NavItem
              label="Séries"
              icon={<Tv size={ICON_SIZE} />}
              isActive={activeTab === 'series'}
              onClick={() => onSelectTab('series')}
            />
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
                  <Badge variant="accent" className="sidebar-badge" aria-hidden="true">
                    {activeDownloadCount}
                  </Badge>
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

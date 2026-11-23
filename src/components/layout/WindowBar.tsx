import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../ui';
import { IS_MAC } from '../../hooks/useSidebar';

interface WindowBarProps {
  readonly isSidebarCollapsed: boolean;
  readonly sidebarId: string;
  readonly onToggleSidebar: () => void;
}

/**
 * Leading part of the top row, level with the macOS traffic lights: app name and sidebar toggle.
 * It never moves, whether the sidebar is docked or hidden;
 * the page toolbar (title, search) follows it in the same row.
 */
export function WindowBar({
  isSidebarCollapsed,
  sidebarId,
  onToggleSidebar,
}: Readonly<WindowBarProps>) {
  const label = isSidebarCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale';
  const shortcut = IS_MAC ? 'Cmd+B' : 'Ctrl+B';

  return (
    <div className="window-bar" data-tauri-drag-region="true">
      <h1 className="window-bar-logo">Melia</h1>
      <IconButton
        className="window-bar-toggle"
        variant="ghost"
        size="sm"
        icon={
          // Icon swap: both icons stay mounted in the same cell and cross-fade
          <span
            className="t-icon-swap"
            data-state={isSidebarCollapsed ? 'open' : 'close'}
            aria-hidden="true"
          >
            <span className="t-icon" data-icon="open">
              <PanelLeftOpen size={18} />
            </span>
            <span className="t-icon" data-icon="close">
              <PanelLeftClose size={18} />
            </span>
          </span>
        }
        aria-label={label}
        title={`${label} (${shortcut})`}
        aria-expanded={!isSidebarCollapsed}
        aria-controls={sidebarId}
        aria-keyshortcuts={IS_MAC ? 'Meta+B' : 'Control+B'}
        onClick={onToggleSidebar}
      />
    </div>
  );
}

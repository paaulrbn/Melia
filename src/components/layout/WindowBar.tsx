import { PanelLeft } from 'lucide-react';
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
  // Written the way each system writes it: ⌘B on macOS, Ctrl+B elsewhere
  const shortcut = IS_MAC ? '⌘B' : 'Ctrl+B';

  return (
    <div className="window-bar" data-tauri-drag-region="true">
      <h1 className="window-bar-logo">Melia</h1>
      <IconButton
        className="window-bar-toggle"
        variant="ghost"
        size="sm"
        // Same icon in both states (macOS): the label and aria-expanded carry the state
        icon={<PanelLeft size={18} aria-hidden="true" />}
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

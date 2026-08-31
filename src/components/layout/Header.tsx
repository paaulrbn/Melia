import { getCurrentWindow } from '@tauri-apps/api/window';
import { TabType } from '../../types';
import { Settings } from 'lucide-react';
import { Badge } from '../ui';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  activeDownloadCount: number;
}

export function Header({ activeTab, setActiveTab, activeDownloadCount }: HeaderProps) {
  const handleDragMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  };

  return (
    <header className="melia-header" data-tauri-drag-region="true" onMouseDown={handleDragMouseDown}>
      <h1 style={{ pointerEvents: 'none' }}>Melia</h1>

      <div className="header-tabs">
        <button
          className={`tab-btn ${activeTab === 'movies' ? 'active' : ''}`}
          onClick={() => setActiveTab('movies')}
        >
          Films
        </button>
        <button
          className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
          onClick={() => setActiveTab('downloads')}
        >
          Téléchargements {activeDownloadCount > 0 && <Badge variant="accent">{activeDownloadCount}</Badge>}
        </button>
        <button
          className={`tab-btn tab-btn-icon ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title="Paramètres"
          aria-label="Paramètres"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

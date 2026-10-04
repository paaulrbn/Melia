import { TabType } from '../../types';
import { Settings } from 'lucide-react';
import { Badge } from '../ui';

interface HeaderProps {
  readonly activeTab: TabType;
  readonly setActiveTab: (tab: TabType) => void;
  readonly activeDownloadCount: number;
}

export function Header({
  activeTab,
  setActiveTab,
  activeDownloadCount,
}: Readonly<HeaderProps>) {
  return (
    <header className="melia-header" data-tauri-drag-region="true">
      <h1 style={{ pointerEvents: 'none' }}>Melia</h1>

      <div className="header-tabs">
        <button
          className={`tab-btn ${activeTab === 'movies' ? 'active' : ''}`}
          onClick={() => setActiveTab('movies')}
        >
          Films
        </button>
        <button
          className={`tab-btn ${activeTab === 'series' ? 'active' : ''}`}
          onClick={() => setActiveTab('series')}
        >
          Séries
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

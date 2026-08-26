import { AppInfo, Config } from '../../types';
import { CONFIG_FIELDS } from '../../utils/constants';

interface SettingsViewProps {
  downloadDir: string;
  appInfo: AppInfo | null;
  onSelectFolder: () => void;
  onOpenFolder: () => void;
  onResetFolder: () => void;
  updateVersion: string | null;
  checkingUpdate: boolean;
  isInstalling: boolean;
  updateStatusText: string | null;
  onManualCheckUpdate: () => void;
  onInstallUpdate: () => void;
  config: Config;
  editingConfig: Config;
  setEditingConfig: React.Dispatch<React.SetStateAction<Config>>;
  isEditingConfig: boolean;
  configSaved: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveConfig: () => void;
}

export function SettingsView({
  downloadDir,
  appInfo,
  onSelectFolder,
  onOpenFolder,
  onResetFolder,
  updateVersion,
  checkingUpdate,
  isInstalling,
  updateStatusText,
  onManualCheckUpdate,
  onInstallUpdate,
  config,
  editingConfig,
  setEditingConfig,
  isEditingConfig,
  configSaved,
  onStartEditing,
  onCancelEditing,
  onSaveConfig,
}: SettingsViewProps) {
  const currentDownloadDir = downloadDir || appInfo?.default_download_dir || 'Chargement…';
  const isCustomFolder = Boolean(
    downloadDir && appInfo && downloadDir !== appInfo.default_download_dir
  );

  return (
    <div className="settings-view">
      <h2>Paramètres</h2>

      <div className="settings-list">
        {/* Download folder */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h4>Dossier de téléchargement</h4>
            <span className="settings-value" title={currentDownloadDir}>
              {currentDownloadDir}
            </span>
          </div>
          <div className="settings-item-actions">
            <button className="btn-small" onClick={onSelectFolder}>
              Changer
            </button>
            <button className="btn-small" onClick={onOpenFolder}>
              Ouvrir
            </button>
            {isCustomFolder && (
              <button className="btn-small btn-ghost" onClick={onResetFolder}>
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Version */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h4>Version</h4>
            <span className="settings-value">
              v{appInfo?.version || '0.1.0'} {updateVersion ? `(v${updateVersion} disponible)` : ''}
            </span>
            {updateStatusText && (
              <span className="settings-status-text">{updateStatusText}</span>
            )}
          </div>
          <div className="settings-item-actions">
            <button
              className="btn-small"
              onClick={onManualCheckUpdate}
              disabled={checkingUpdate || isInstalling}
            >
              {checkingUpdate ? 'Vérification…' : 'Vérifier les mises à jour'}
            </button>
            {updateVersion && (
              <button
                className="btn-play-small"
                onClick={onInstallUpdate}
                disabled={isInstalling}
              >
                {isInstalling ? 'Installation…' : 'Mettre à jour'}
              </button>
            )}
          </div>
        </div>

        {/* Server configuration */}
        <div className="settings-section-title">
          <h3>Configuration du serveur</h3>
        </div>

        <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '15px' }}>
          {isEditingConfig ? (
            <>
              <div className="config-grid">
                {CONFIG_FIELDS.map(field => (
                  <div key={field.key} className="config-row">
                    <div className="config-label">{field.label}</div>
                    <input
                      type={field.type || 'text'}
                      className="settings-input"
                      placeholder={field.placeholder}
                      value={editingConfig[field.key] || ''}
                      onChange={e =>
                        setEditingConfig(prev => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div
                className="config-actions"
                style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}
              >
                {configSaved && (
                  <span className="settings-saved-text" style={{ marginRight: 'auto', alignSelf: 'center' }}>
                    ✓ Configuration sauvegardée
                  </span>
                )}
                <button className="btn-small" onClick={onCancelEditing}>
                  Annuler
                </button>
                <button
                  className="btn-small"
                  style={{ background: 'white', color: 'black', fontWeight: 600, border: 'none' }}
                  onClick={onSaveConfig}
                >
                  Sauvegarder
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="config-grid">
                {CONFIG_FIELDS.map(field => (
                  <div key={field.key} className="config-row">
                    <div className="config-label">{field.label}</div>
                    <div className="config-value">
                      {field.type === 'password' && config[field.key]
                        ? '••••••••'
                        : config[field.key] || '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="config-actions"
                style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}
              >
                <button className="btn-small" onClick={onStartEditing}>
                  Modifier
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

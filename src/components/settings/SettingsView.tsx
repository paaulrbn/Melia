import { AppInfo, Config } from '../../types';
import { CONFIG_FIELDS } from '../../utils/constants';
import { Check } from 'lucide-react';
import { Button, Input } from '../ui';

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
            <Button variant="secondary" size="sm" onClick={onSelectFolder}>
              Changer
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenFolder}>
              Ouvrir
            </Button>
            {isCustomFolder && (
              <Button variant="ghost" size="sm" onClick={onResetFolder}>
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Version */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h4>Version</h4>
            <span className="settings-value">
              v{appInfo?.version || '0.2.0'} {updateVersion ? `(v${updateVersion} disponible)` : ''}
            </span>
            {updateStatusText && (
              <span className="settings-status-text">{updateStatusText}</span>
            )}
          </div>
          <div className="settings-item-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={onManualCheckUpdate}
              disabled={checkingUpdate || isInstalling}
              isLoading={checkingUpdate}
            >
              {checkingUpdate ? 'Vérification…' : 'Vérifier les mises à jour'}
            </Button>
            {updateVersion && (
              <Button
                variant="primary"
                size="sm"
                onClick={onInstallUpdate}
                disabled={isInstalling}
                isLoading={isInstalling}
              >
                {isInstalling ? 'Installation…' : 'Mettre à jour'}
              </Button>
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
                    <Input
                      label={field.label}
                      type={field.type || 'text'}
                      inputSize="sm"
                      fullWidth
                      placeholder={field.placeholder}
                      value={editingConfig[field.key] || ''}
                      onChange={e =>
                        setEditingConfig(prev => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="config-actions">
                <Button variant="secondary" size="sm" onClick={onCancelEditing}>
                  Annuler
                </Button>
                <Button variant="primary" size="sm" onClick={onSaveConfig}>
                  Sauvegarder
                </Button>
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
              <div className="config-actions">
                {configSaved && (
                  <span className="settings-saved-text" style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={16} />
                    Configuration sauvegardée
                  </span>
                )}
                <Button variant="secondary" size="sm" onClick={onStartEditing}>
                  Modifier
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

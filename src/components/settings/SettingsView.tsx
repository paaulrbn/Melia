import { AppInfo, Config, ConfigField } from '../../types';
import { RADARR_CONFIG_FIELDS, STREAMING_CONFIG_FIELDS } from '../../utils/constants';
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

function formatConfigValue(field: ConfigField, value?: string): string {
  if (!value) return '—';
  if (field.type === 'password' || field.key === 'MEDIA_SERVER_PASSWORD') {
    return '••••••••';
  }
  if (field.key === 'RADARR_API_KEY') {
    if (value.length > 8) {
      return `${value.slice(0, 4)}••••${value.slice(-4)}`;
    }
    return '••••••••';
  }
  return value;
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
            <span className="config-label">Dossier de téléchargement</span>
            <span className="config-value-highlight" title={currentDownloadDir}>
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
            <span className="config-label">Version installée</span>
            <span className="config-value-highlight">
              v{appInfo?.version || '0.2.1'} {updateVersion ? `(v${updateVersion} disponible)` : ''}
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

        {/* Server configuration Header */}
        <div className="settings-section-header">
          <div className="settings-section-title">
            <h3>Configuration du serveur</h3>
          </div>
          <div className="settings-section-actions">
            {configSaved && (
              <span className="settings-saved-text">
                <Check size={16} />
                Enregistré
              </span>
            )}
            {!isEditingConfig ? (
              <Button variant="secondary" size="sm" onClick={onStartEditing}>
                Modifier
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" size="sm" onClick={onCancelEditing}>
                  Annuler
                </Button>
                <Button variant="primary" size="sm" onClick={onSaveConfig}>
                  Sauvegarder
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Radarr Sub-group */}
        <div className="settings-item settings-item--block">
          <div className="settings-group-header">
            <h4>Serveur Radarr</h4>
          </div>
          {isEditingConfig ? (
            <div className="config-grid">
              {RADARR_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <label htmlFor={`config-input-${field.key}`} className="config-label">
                    {field.label}
                  </label>
                  <Input
                    id={`config-input-${field.key}`}
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
          ) : (
            <div className="config-grid">
              {RADARR_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <div className="config-label">{field.label}</div>
                  <div className="config-value" title={config[field.key] || undefined}>
                    {formatConfigValue(field, config[field.key])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Streaming Sub-group */}
        <div className="settings-item settings-item--block">
          <div className="settings-group-header">
            <h4>Serveur de streaming</h4>
          </div>
          {isEditingConfig ? (
            <div className="config-grid">
              {STREAMING_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <label htmlFor={`config-input-${field.key}`} className="config-label">
                    {field.label}
                  </label>
                  <Input
                    id={`config-input-${field.key}`}
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
          ) : (
            <div className="config-grid">
              {STREAMING_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <div className="config-label">{field.label}</div>
                  <div className="config-value" title={config[field.key] || undefined}>
                    {formatConfigValue(field, config[field.key])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

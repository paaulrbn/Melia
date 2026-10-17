import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppInfo, Config, ConfigField } from '../../types';
import { RADARR_CONFIG_FIELDS, SONARR_CONFIG_FIELDS, STREAMING_CONFIG_FIELDS } from '../../utils/constants';
import { Check, Eye, EyeOff } from 'lucide-react';
import { Button, IconButton, Input } from '../ui';

interface SettingsViewProps {
  readonly downloadDir: string;
  readonly appInfo: AppInfo | null;
  readonly onSelectFolder: () => void;
  readonly onOpenFolder: () => void;
  readonly onResetFolder: () => void;
  readonly updateVersion: string | null;
  readonly checkingUpdate: boolean;
  readonly isInstalling: boolean;
  readonly updateStatusText: string | null;
  readonly onManualCheckUpdate: () => void;
  readonly onInstallUpdate: () => void;
  readonly config: Config;
  readonly editingConfig: Config;
  readonly setEditingConfig: Dispatch<SetStateAction<Config>>;
  readonly isEditingConfig: boolean;
  readonly configSaved: boolean;
  readonly onStartEditing: () => void;
  readonly onCancelEditing: () => void;
  readonly onSaveConfig: () => void;
}

function isSecretField(field: ConfigField): boolean {
  return (
    field.type === 'password' ||
    field.key === 'MEDIA_SERVER_PASSWORD' ||
    field.key === 'RADARR_API_KEY' ||
    field.key === 'SONARR_API_KEY'
  );
}

/** Tooltip with the full value, never for secrets (the native tooltip would reveal them on hover). */
function configValueTitle(field: ConfigField, value?: string): string | undefined {
  if (!value || isSecretField(field)) return undefined;
  return value;
}

function formatConfigValue(field: ConfigField, value?: string): string {
  if (!value) return '—';
  if (field.type === 'password' || field.key === 'MEDIA_SERVER_PASSWORD') {
    return '••••••••';
  }
  if (field.key === 'RADARR_API_KEY' || field.key === 'SONARR_API_KEY') {
    if (value.length > 8) {
      return `${value.slice(0, 4)}••••${value.slice(-4)}`;
    }
    return '••••••••';
  }
  return value;
}

interface ConfigFieldInputProps {
  readonly field: ConfigField;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** Input of a config field. Secrets stay masked while typing, with a button to reveal them on demand. */
function ConfigFieldInput({ field, value, onChange }: Readonly<ConfigFieldInputProps>) {
  const [revealed, setRevealed] = useState(false);
  const secret = isSecretField(field);

  return (
    <Input
      id={`config-input-${field.key}`}
      type={secret && !revealed ? 'password' : 'text'}
      inputSize="sm"
      fullWidth
      autoComplete="off"
      spellCheck={false}
      placeholder={field.placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      rightElement={
        secret ? (
          <IconButton
            icon={revealed ? <EyeOff size={16} /> : <Eye size={16} />}
            onClick={() => setRevealed(prev => !prev)}
            aria-label={revealed ? 'Masquer la valeur' : 'Afficher la valeur'}
            size="sm"
            shape="circle"
            variant="ghost"
          />
        ) : undefined
      }
    />
  );
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
}: Readonly<SettingsViewProps>) {
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
              v{appInfo?.version || '0.3.3'} {updateVersion ? `(v${updateVersion} disponible)` : ''}
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
                  <ConfigFieldInput
                    field={field}
                    value={editingConfig[field.key] || ''}
                    onChange={value => setEditingConfig(prev => ({ ...prev, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="config-grid">
              {RADARR_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <div className="config-label">{field.label}</div>
                  <div className="config-value" title={configValueTitle(field, config[field.key])}>
                    {formatConfigValue(field, config[field.key])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sonarr Sub-group */}
        <div className="settings-item settings-item--block">
          <div className="settings-group-header">
            <h4>Serveur Sonarr</h4>
          </div>
          {isEditingConfig ? (
            <div className="config-grid">
              {SONARR_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <label htmlFor={`config-input-${field.key}`} className="config-label">
                    {field.label}
                  </label>
                  <ConfigFieldInput
                    field={field}
                    value={editingConfig[field.key] || ''}
                    onChange={value => setEditingConfig(prev => ({ ...prev, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="config-grid">
              {SONARR_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <div className="config-label">{field.label}</div>
                  <div className="config-value" title={configValueTitle(field, config[field.key])}>
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
                  <ConfigFieldInput
                    field={field}
                    value={editingConfig[field.key] || ''}
                    onChange={value => setEditingConfig(prev => ({ ...prev, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="config-grid">
              {STREAMING_CONFIG_FIELDS.map(field => (
                <div key={field.key} className="config-row">
                  <div className="config-label">{field.label}</div>
                  <div className="config-value" title={configValueTitle(field, config[field.key])}>
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

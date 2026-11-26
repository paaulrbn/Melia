import { useEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Check } from 'lucide-react';
import { AppInfo, Config, ConfigField } from '../../types';
import { RADARR_CONFIG_FIELDS, SONARR_CONFIG_FIELDS, STREAMING_CONFIG_FIELDS } from '../../utils/constants';
import { Button, Input } from '../ui';
import {
  ConnectionStatus,
  SettingsGroupHead,
  SettingsSection,
  type ConnectionState,
} from './SettingsGroup';
import { RootFolderPicker, type RootFolderUnavailable } from './RootFolderPicker';

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
  /** Last error while loading the Radarr library (null when it answered) */
  readonly radarrError?: string | null;
  /** Last error while loading the Sonarr library (null when it answered) */
  readonly sonarrError?: string | null;
  /** Opens the "Nouveautés" sheet of the installed version */
  readonly onShowChangelog?: () => void;
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

/** Short labels inside a server group: its title already names the server. */
const SHORT_LABELS: Record<string, string> = {
  RADARR_BASE_URL: 'Adresse',
  RADARR_API_KEY: 'Clé API',
  RADARR_ROOT_FOLDER: 'Dossier racine',
  SONARR_BASE_URL: 'Adresse',
  SONARR_API_KEY: 'Clé API',
  SONARR_ROOT_FOLDER: 'Dossier racine',
  MEDIA_SERVER_HOST: 'Hôte',
  MEDIA_SERVER_ROOT_PATH: 'Chemin racine',
  MEDIA_SERVER_USERNAME: 'Utilisateur',
  MEDIA_SERVER_PASSWORD: 'Mot de passe',
};

interface ServerGroup {
  readonly id: string;
  readonly title: string;
  /** Read by screen readers after the short label ("Adresse de Radarr") */
  readonly context: string;
  readonly fields: readonly ConfigField[];
}

const SERVER_GROUPS: readonly ServerGroup[] = [
  { id: 'radarr', title: 'Radarr', context: 'de Radarr', fields: RADARR_CONFIG_FIELDS },
  { id: 'sonarr', title: 'Sonarr', context: 'de Sonarr', fields: SONARR_CONFIG_FIELDS },
  {
    id: 'streaming',
    title: 'Serveur de streaming',
    context: 'du serveur de streaming',
    fields: STREAMING_CONFIG_FIELDS,
  },
];

/** Config fields chosen from the server's root folders while editing */
const ROOT_FOLDER_SERVERS: Record<string, 'radarr' | 'sonarr'> = {
  RADARR_ROOT_FOLDER: 'radarr',
  SONARR_ROOT_FOLDER: 'sonarr',
};

/**
 * The folder list uses the saved address and key (Rust side): it is offered only when the
 * form holds both and they are the saved ones.
 */
function rootFolderUnavailable(
  server: 'radarr' | 'sonarr',
  saved: Config,
  editing: Config
): RootFolderUnavailable {
  const prefix = server === 'radarr' ? 'RADARR' : 'SONARR';
  const url = (editing[`${prefix}_BASE_URL`] ?? '').trim();
  const key = (editing[`${prefix}_API_KEY`] ?? '').trim();
  if (!url || !key) return 'missing';
  const savedUrl = (saved[`${prefix}_BASE_URL`] ?? '').trim();
  const savedKey = (saved[`${prefix}_API_KEY`] ?? '').trim();
  return url === savedUrl && key === savedKey ? null : 'unsaved';
}

function connectionState(configured: boolean, error: string | null | undefined): ConnectionState {
  if (!configured) return 'missing';
  return error ? 'error' : 'ok';
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
  radarrError,
  sonarrError,
  onShowChangelog,
}: Readonly<SettingsViewProps>) {
  const currentDownloadDir = downloadDir || appInfo?.default_download_dir || 'Chargement…';
  const isCustomFolder = Boolean(
    downloadDir && appInfo && downloadDir !== appInfo.default_download_dir
  );

  // Editing: focus goes to the first field, then back to "Modifier" once done
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(isEditingConfig);
  useEffect(() => {
    if (isEditingConfig && !wasEditing.current) {
      document.getElementById(`config-input-${SERVER_GROUPS[0].fields[0].key}`)?.focus();
    } else if (!isEditingConfig && wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = isEditingConfig;
  }, [isEditingConfig]);

  const statuses: Record<string, ConnectionState | null> = {
    radarr: connectionState(Boolean(config.RADARR_BASE_URL && config.RADARR_API_KEY), radarrError),
    sonarr: connectionState(Boolean(config.SONARR_BASE_URL && config.SONARR_API_KEY), sonarrError),
    // No check of the streaming server: only say when it is missing
    streaming: config.MEDIA_SERVER_HOST ? null : 'missing',
  };
  const errors: Record<string, string | null | undefined> = {
    radarr: statuses.radarr === 'error' ? radarrError : null,
    sonarr: statuses.sonarr === 'error' ? sonarrError : null,
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSaveConfig();
  };

  const isUpdateError = Boolean(updateStatusText?.startsWith('Erreur'));
  const version = appInfo?.version || '0.4.0';

  const serverGroups = SERVER_GROUPS.map(group => {
    const titleId = `settings-${group.id}-title`;
    const status = statuses[group.id];
    const error = errors[group.id];
    const errorId = `settings-${group.id}-error`;

    return (
      <div key={group.id} className="settings-subgroup" role="group" aria-labelledby={titleId}>
        <SettingsGroupHead
          id={titleId}
          title={group.title}
          trailing={status ? <ConnectionStatus state={status} /> : undefined}
        />
        {isEditingConfig ? (
          <div className="settings-group">
            {group.fields.map(field => {
              const inputId = `config-input-${field.key}`;
              return (
                <div key={field.key} className="settings-row settings-row--field">
                  <label htmlFor={inputId} className="settings-row-label">
                    {SHORT_LABELS[field.key] ?? field.label}
                    <span className="sr-only"> {group.context}</span>
                  </label>
                  {ROOT_FOLDER_SERVERS[field.key] ? (
                    <RootFolderPicker
                      server={ROOT_FOLDER_SERVERS[field.key]}
                      inputId={inputId}
                      value={editingConfig[field.key] || ''}
                      placeholder={field.placeholder}
                      unavailable={rootFolderUnavailable(
                        ROOT_FOLDER_SERVERS[field.key],
                        config,
                        editingConfig
                      )}
                      onChange={value =>
                        setEditingConfig(prev => ({ ...prev, [field.key]: value }))
                      }
                    />
                  ) : (
                    // Secrets are always masked and can never be revealed from the interface
                    <Input
                      id={inputId}
                      type={isSecretField(field) ? 'password' : 'text'}
                      inputSize="sm"
                      containerClassName="settings-row-input"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder={field.placeholder}
                      value={editingConfig[field.key] || ''}
                      onChange={e =>
                        setEditingConfig(prev => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <dl className="settings-group" aria-describedby={error ? errorId : undefined}>
            {group.fields.map(field => {
              const value = config[field.key];
              const secret = isSecretField(field) && Boolean(value);
              return (
                <div key={field.key} className="settings-row">
                  <dt className="settings-row-label">
                    {SHORT_LABELS[field.key] ?? field.label}
                    <span className="sr-only"> {group.context}</span>
                  </dt>
                  <dd
                    className="settings-row-value"
                    data-empty={value ? undefined : ''}
                    title={configValueTitle(field, value)}
                  >
                    {secret ? (
                      <>
                        <span aria-hidden="true">{formatConfigValue(field, value)}</span>
                        <span className="sr-only">Masqué</span>
                      </>
                    ) : value ? (
                      formatConfigValue(field, value)
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Non renseigné</span>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        {error && !isEditingConfig && (
          <p className="settings-footnote settings-footnote--error" id={errorId}>
            {`Connexion impossible : ${error}. Vérifiez l’adresse et la clé API.`}
          </p>
        )}
      </div>
    );
  });

  return (
    <div className="settings-view">
      <SettingsSection id="settings-storage" title="Stockage">
        <div className="settings-group">
          <div className="settings-row settings-row--wrap">
            <div className="settings-row-text">
              <span className="settings-row-label" id="settings-folder-label">
                Dossier de téléchargement
              </span>
              <span className="settings-row-detail settings-path" title={currentDownloadDir}>
                {currentDownloadDir}
              </span>
            </div>
            <div className="settings-row-actions">
              {isCustomFolder && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResetFolder}
                  aria-describedby="settings-folder-label"
                >
                  Par défaut
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenFolder}
                aria-describedby="settings-folder-label"
              >
                Ouvrir
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelectFolder}
                aria-describedby="settings-folder-label"
              >
                Changer…
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-servers"
        title="Serveurs"
        description="Radarr gère les films, Sonarr les séries, et le serveur de streaming sert à la lecture et aux téléchargements."
      >
        {isEditingConfig ? (
          <form className="settings-servers" onSubmit={handleSubmit} noValidate>
            {serverGroups}
            <div className="settings-form-footer">
              <div className="settings-row-actions">
                <Button type="button" variant="secondary" size="sm" onClick={onCancelEditing}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Enregistrer
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="settings-servers">
            {serverGroups}
            <div className="settings-form-footer">
              <div className="settings-row-actions">
                <span className="settings-saved" role="status">
                  {configSaved && (
                    <>
                      <Check size={16} aria-hidden="true" />
                      Enregistré
                    </>
                  )}
                </span>
                <Button ref={editButtonRef} variant="secondary" size="sm" onClick={onStartEditing}>
                  Modifier
                </Button>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection id="settings-app" title="Application">
        <div className="settings-group">
          <div className="settings-row settings-row--wrap">
            <div className="settings-row-text">
              <span className="settings-row-label" id="settings-version-label">
                Version {version}
              </span>
              <span
                className="settings-row-detail"
                data-tone={isUpdateError ? 'error' : undefined}
                role="status"
              >
                {updateVersion && !updateStatusText
                  ? `La version ${updateVersion} est disponible.`
                  : updateStatusText}
              </span>
            </div>
            <div className="settings-row-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={onManualCheckUpdate}
                disabled={checkingUpdate || isInstalling}
                isLoading={checkingUpdate}
              >
                {checkingUpdate ? 'Recherche…' : 'Rechercher une mise à jour'}
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

          {onShowChangelog && (
            <div className="settings-row">
              <span className="settings-row-label" id="settings-changelog-label">
                Nouveautés de cette version
              </span>
              <div className="settings-row-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onShowChangelog}
                  aria-describedby="settings-changelog-label"
                >
                  Afficher
                </Button>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}

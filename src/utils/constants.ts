import { ConfigField } from '../types';

export const RADARR_CONFIG_FIELDS: ConfigField[] = [
  { key: "RADARR_BASE_URL", label: "URL Radarr", placeholder: "https://192.168.1.x:7878" },
  { key: "RADARR_API_KEY", label: "Clé API Radarr", placeholder: "Clé API Radarr" },
  { key: "RADARR_ROOT_FOLDER", label: "Dossier racine Radarr", placeholder: "/movies" },
];

export const SONARR_CONFIG_FIELDS: ConfigField[] = [
  { key: "SONARR_BASE_URL", label: "URL Sonarr", placeholder: "https://192.168.1.x:8989" },
  { key: "SONARR_API_KEY", label: "Clé API Sonarr", placeholder: "Clé API Sonarr" },
  { key: "SONARR_ROOT_FOLDER", label: "Dossier racine Sonarr", placeholder: "/tv" },
];

export const STREAMING_CONFIG_FIELDS: ConfigField[] = [
  { key: "MEDIA_SERVER_HOST", label: "Hôte serveur média", placeholder: "exemple.com" },
  { key: "MEDIA_SERVER_ROOT_PATH", label: "Chemin racine serveur", placeholder: "/paul" },
  { key: "MEDIA_SERVER_USERNAME", label: "Utilisateur serveur", placeholder: "Nom d'utilisateur" },
  { key: "MEDIA_SERVER_PASSWORD", label: "Mot de passe serveur", placeholder: "Mot de passe", type: "password" },
];

export const STORAGE_KEYS = {
  CONFIG: 'melia_config',
  DOWNLOADS: 'melia_downloads',
  DOWNLOAD_DIR: 'melia_download_dir',
  AUTO_DOWNLOAD: 'melia_autodownload_ids',
  SERIES_AUTO_DOWNLOAD: 'melia_series_autodownload_ids',
  LAST_SEEN_VERSION: 'melia_last_seen_version',
} as const;

import { ConfigField } from '../types';

export const RADARR_CONFIG_FIELDS: ConfigField[] = [
  { key: "RADARR_BASE_URL", label: "URL Radarr", placeholder: "http://192.168.1.x:7878" },
  { key: "RADARR_API_KEY", label: "Clé API Radarr", placeholder: "Clé API Radarr" },
  { key: "RADARR_ROOT_FOLDER", label: "Dossier racine Radarr", placeholder: "/movies" },
];

export const STREAMING_CONFIG_FIELDS: ConfigField[] = [
  { key: "MEDIA_SERVER_HOST", label: "Hôte serveur média", placeholder: "exemple.com" },
  { key: "MEDIA_SERVER_ROOT_PATH", label: "Chemin racine serveur", placeholder: "/paul" },
  { key: "MEDIA_SERVER_USERNAME", label: "Utilisateur serveur", placeholder: "Nom d'utilisateur" },
  { key: "MEDIA_SERVER_PASSWORD", label: "Mot de passe serveur", placeholder: "Mot de passe", type: "password" },
];

export const CONFIG_FIELDS: ConfigField[] = [
  ...RADARR_CONFIG_FIELDS,
  ...STREAMING_CONFIG_FIELDS,
];

export const STORAGE_KEYS = {
  CONFIG: 'melia_config',
  DOWNLOADS: 'melia_downloads',
  DOWNLOAD_DIR: 'melia_download_dir',
  AUTO_DOWNLOAD: 'melia_autodownload_ids',
} as const;

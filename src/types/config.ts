export interface Config {
  [key: string]: string;
}

export interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
}

/** Root folder of Radarr or Sonarr (`GET /api/v3/rootfolder`), fields used by Melia */
export interface RootFolder {
  id: number;
  path: string;
  accessible?: boolean;
  /** Free space in bytes */
  freeSpace?: number;
}

export type TabType = 'movies' | 'downloads' | 'settings';

export interface AppInfo {
  version: string;
  default_download_dir: string;
  os: string;
  arch: string;
}

export interface UpdateCheckResult {
  available: boolean;
  current_version: string;
  latest_version?: string | null;
  error?: string | null;
}

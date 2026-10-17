import { invoke } from '@tauri-apps/api/core';
import { Config } from '../types';

/**
 * Server settings (Radarr/Sonarr URL and key, media server credentials, download folder)
 * are held on the Rust side. Every command that depends on them goes through `invokeSynced`,
 * which waits for the latest push to finish so a request never runs with stale settings.
 */
let pending: Promise<unknown> = Promise.resolve();

function enqueue(command: string, args: Record<string, unknown>): Promise<unknown> {
  pending = pending.then(() => invoke(command, args)).catch(() => undefined);
  return pending;
}

export function syncApiConfig(config: Config): Promise<unknown> {
  return enqueue('set_api_config', {
    config: {
      radarrUrl: config['RADARR_BASE_URL'] ?? '',
      radarrKey: config['RADARR_API_KEY'] ?? '',
      sonarrUrl: config['SONARR_BASE_URL'] ?? '',
      sonarrKey: config['SONARR_API_KEY'] ?? '',
      mediaHost: config['MEDIA_SERVER_HOST'] ?? '',
      mediaUser: config['MEDIA_SERVER_USERNAME'] ?? '',
      mediaPassword: config['MEDIA_SERVER_PASSWORD'] ?? '',
    },
  });
}

/** `previousDirs`: folders used before, so files already downloaded there stay playable and deletable. */
export function syncDownloadDir(dir: string, previousDirs: string[] = []): Promise<unknown> {
  return enqueue('set_download_dir', { dir: dir || null, previousDirs });
}

export async function invokeSynced<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await pending;
  return invoke<T>(command, args);
}

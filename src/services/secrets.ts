import { invoke } from '@tauri-apps/api/core';
import { Config } from '../types';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * Config keys stored in the OS keychain (macOS Keychain, Windows Credential Manager), never in localStorage.
 * All of them live in ONE keychain entry (one JSON object): macOS asks for access entry by entry.
 */
export const SECRET_KEYS = ['RADARR_API_KEY', 'SONARR_API_KEY', 'MEDIA_SERVER_PASSWORD'] as const;

function isSecretKey(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/** Splits a config into its public part and its (non-empty) secrets. */
export function splitConfig(config: Config): { publicPart: Config; secrets: Config } {
  const publicPart: Config = {};
  const secrets: Config = {};
  for (const [key, value] of Object.entries(config)) {
    if (!isSecretKey(key)) {
      publicPart[key] = value;
    } else if (value) {
      secrets[key] = value;
    }
  }
  return { publicPart, secrets };
}

/**
 * Merges the sources of a secret, from the oldest to the most recent:
 * old per-secret keychain entries < current keychain entry < clear text left in localStorage
 * (written when the keychain was unavailable, so it is newer than what the keychain holds).
 */
export function mergeSecrets(legacyKeychain: Config, keychain: Config, localStorageSecrets: Config): Config {
  return { ...legacyKeychain, ...keychain, ...localStorageSecrets };
}

function readStoredConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Config) : {};
  } catch {
    return {};
  }
}

function writeStoredConfig(config: Config): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  } catch {
    // Storage unavailable: nothing more to do
  }
}

function isMigrationDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.SECRETS_MIGRATED) === '1';
  } catch {
    return false;
  }
}

function markMigrationDone(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SECRETS_MIGRATED, '1');
  } catch {
    // The migration check will simply run again at the next launch
  }
}

async function storeSecrets(secrets: Config): Promise<boolean> {
  try {
    await invoke('set_secrets', { values: secrets });
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves the config: public values in localStorage, secrets in the keychain (one write).
 * If the keychain is unavailable, the secrets stay in localStorage so the user does not lose them,
 * and their keys are returned so the UI can warn that they are stored in clear text.
 */
export async function persistConfig(config: Config): Promise<string[]> {
  const { publicPart, secrets } = splitConfig(config);

  const stored = await storeSecrets(secrets);
  if (stored) {
    writeStoredConfig(publicPart);
    return [];
  }

  writeStoredConfig({ ...publicPart, ...secrets });
  return Object.keys(secrets);
}

/**
 * Moves secrets from the older storage forms (one keychain entry per secret, clear text in
 * localStorage) to the single keychain entry, then erases the old ones. Runs once.
 */
async function migrateLegacySecrets(stored: Config, keychain: Config): Promise<Config> {
  const { publicPart, secrets: localSecrets } = splitConfig(stored);
  const hasLocalSecrets = Object.keys(localSecrets).length > 0;
  if (isMigrationDone() && !hasLocalSecrets) {
    return keychain;
  }

  let legacyKeychain: Config = {};
  if (!isMigrationDone()) {
    try {
      legacyKeychain = await invoke<Config>('read_legacy_secrets');
    } catch {
      // Old entries unreadable (access refused): try again at the next launch
      return mergeSecrets({}, keychain, localSecrets);
    }
  }

  const merged = mergeSecrets(legacyKeychain, keychain, localSecrets);
  if (!(await storeSecrets(merged))) {
    return merged;
  }

  try {
    await invoke('delete_legacy_secrets');
  } catch {
    // Old entries stay; they are ignored from now on and the next launch retries the cleanup
    return merged;
  }
  writeStoredConfig(publicPart);
  markMigrationDone();
  return merged;
}

/** Loads the saved config: public values from localStorage, secrets from the keychain (one read). */
export async function loadSavedConfig(): Promise<Config> {
  const stored = readStoredConfig();

  let keychain: Config;
  try {
    keychain = await invoke<Config>('get_secrets');
  } catch {
    // Keychain unavailable: secrets are only what localStorage still holds
    return stored;
  }

  const secrets = await migrateLegacySecrets(stored, keychain);
  return { ...splitConfig(stored).publicPart, ...secrets };
}

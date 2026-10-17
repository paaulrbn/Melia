import { useState, useEffect, useCallback } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { Config } from '../types';
import { getNativeConfig } from '../services/system';
import { decryptConfigPayload } from '../services/crypto';
import { loadSavedConfig, persistConfig } from '../services/secrets';
import { syncApiConfig } from '../services/runtime';

export function useConfig() {
  const [config, setConfig] = useState<Config>({});
  const [editingConfig, setEditingConfig] = useState<Config>({});
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [keychainWarning, setKeychainWarning] = useState<string | null>(null);

  const warnIfStoredInClear = (storedInClear: string[]) => {
    setKeychainWarning(
      storedInClear.length > 0
        ? 'Le trousseau du système est indisponible : les clés et mots de passe sont enregistrés en clair sur cet appareil.'
        : null
    );
  };

  // Deep link prompt state
  const [showConfigPrompt, setShowConfigPrompt] = useState(false);
  const [configPayload, setConfigPayload] = useState<string | null>(null);
  const [configPassword, setConfigPassword] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);

  const handleDeepLink = useCallback((urls: string[]) => {
    for (const urlStr of urls) {
      if (urlStr.startsWith('melia://config')) {
        try {
          const parts = urlStr.split('?data=');
          if (parts.length > 1) {
            let payloadStr = decodeURIComponent(parts[1]).trimEnd();
            while (payloadStr.endsWith('/')) {
              payloadStr = payloadStr.slice(0, -1).trimEnd();
            }
            setConfigPayload(payloadStr);
            setShowConfigPrompt(true);
            setConfigError(null);
            setConfigPassword('');
          }
        } catch (_e) {
          // ignore
        }
      }
    }
  }, []);

  const handleDecrypt = async () => {
    if (!configPayload || !configPassword) return;
    try {
      const parsedConfig = await decryptConfigPayload(configPayload, configPassword);
      warnIfStoredInClear(await persistConfig(parsedConfig));
      setConfig(parsedConfig);
      setEditingConfig(parsedConfig);
      setShowConfigPrompt(false);
      setConfigPayload(null);
    } catch (e: unknown) {
      const message = e instanceof Error && e.message ? e.message : 'Mot de passe incorrect ou données corrompues.';
      setConfigError(`Erreur: ${message}`);
    }
  };

  const handleCancelPrompt = () => {
    setShowConfigPrompt(false);
    setConfigPayload(null);
    setConfigPassword('');
    setConfigError(null);
  };

  const loadConfig = useCallback(async () => {
    let conf: Config = {};
    try {
      conf = await loadSavedConfig();
    } catch (_e) {
      // ignore
    }

    if (Object.keys(conf).length === 0) {
      try {
        conf = await getNativeConfig();
      } catch (_e) {
        // ignore
      }
    }

    setConfig(conf);
    setEditingConfig(conf);
  }, []);

  useEffect(() => {
    void loadConfig();

    getCurrent()
      .then(urls => {
        if (urls && urls.length > 0) {
          handleDeepLink(urls);
        }
      })
      .catch(() => {});

    let unlistenDeepLink: (() => void) | undefined;
    onOpenUrl(urls => {
      handleDeepLink(urls);
    })
      .then(unlisten => {
        unlistenDeepLink = unlisten;
      })
      .catch(() => {});

    return () => {
      if (unlistenDeepLink) unlistenDeepLink();
    };
  }, [handleDeepLink, loadConfig]);

  // Radarr/Sonarr/media settings are held by Rust; push them on every change.
  // Declared before the library hooks' effects so requests never run with stale settings.
  useEffect(() => {
    void syncApiConfig(config);
  }, [config]);

  const saveConfig = () => {
    const newConfig = { ...config, ...editingConfig };
    setConfig(newConfig);
    // Pushed right away: callers reload the libraries in the same handler, before effects run
    void syncApiConfig(newConfig);
    void persistConfig(newConfig).then(warnIfStoredInClear);
    setConfigSaved(true);
    setIsEditingConfig(false);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  const startEditing = () => {
    setEditingConfig({ ...config });
    setIsEditingConfig(true);
  };

  const cancelEditing = () => {
    setEditingConfig({ ...config });
    setIsEditingConfig(false);
  };

  return {
    config,
    editingConfig,
    setEditingConfig,
    isEditingConfig,
    configSaved,
    keychainWarning,
    dismissKeychainWarning: () => setKeychainWarning(null),
    startEditing,
    cancelEditing,
    saveConfig,
    showConfigPrompt,
    configPassword,
    setConfigPassword,
    configError,
    handleDecrypt,
    handleCancelPrompt,
    loadConfig,
  };
}

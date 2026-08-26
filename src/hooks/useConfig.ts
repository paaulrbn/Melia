import { useState, useEffect, useCallback } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { Config } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { getNativeConfig } from '../services/system';
import { decryptConfigPayload } from '../services/crypto';

export function useConfig() {
  const [config, setConfig] = useState<Config>({});
  const [editingConfig, setEditingConfig] = useState<Config>({});
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

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
            let payloadStr = decodeURIComponent(parts[1]);
            payloadStr = payloadStr.replace(/[\/\s]+$/, '');
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
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(parsedConfig));
      setConfig(parsedConfig);
      setEditingConfig(parsedConfig);
      setShowConfigPrompt(false);
      setConfigPayload(null);
    } catch (e: any) {
      setConfigError(`Erreur: ${e.message || 'Mot de passe incorrect ou données corrompues.'}`);
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
    const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (savedConfig) {
      try {
        conf = JSON.parse(savedConfig);
      } catch (_e) {
        // ignore
      }
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
    loadConfig();

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

  const saveConfig = () => {
    const newConfig = { ...config, ...editingConfig };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
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

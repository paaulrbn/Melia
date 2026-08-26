import { useState, useEffect, useCallback } from 'react';
import { AppInfo, UpdateCheckResult } from '../types';
import { checkUpdate, getAppInfo, installUpdate } from '../services/system';

export function useUpdater() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  const loadAppInfo = useCallback(async () => {
    try {
      const info = await getAppInfo();
      setAppInfo(info);
      return info;
    } catch (_e) {
      return null;
    }
  }, []);

  useEffect(() => {
    loadAppInfo();

    const updateTimer = setTimeout(async () => {
      try {
        const res: UpdateCheckResult = await checkUpdate();
        if (res.available && res.latest_version) {
          setUpdateVersion(res.latest_version);
        }
      } catch (_e) {
        // ignore
      }
    }, 3000);

    return () => clearTimeout(updateTimer);
  }, [loadAppInfo]);

  const handleManualCheck = async () => {
    setCheckingUpdate(true);
    setUpdateStatusText(null);
    try {
      const res = await checkUpdate();
      if (res.available && res.latest_version) {
        setUpdateVersion(res.latest_version);
        setUpdateStatusText(`Mise à jour v${res.latest_version} disponible !`);
      } else if (res.error) {
        setUpdateStatusText(`Erreur : ${res.error}`);
      } else {
        setUpdateStatusText(`Vous utilisez la dernière version (v${res.current_version})`);
      }
    } catch (e: any) {
      setUpdateStatusText(`Erreur : ${e?.message || e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installUpdate();
    } catch (_e) {
      setIsInstalling(false);
    }
  };

  const dismissUpdate = () => {
    setUpdateVersion(null);
  };

  return {
    appInfo,
    updateVersion,
    isInstalling,
    checkingUpdate,
    updateStatusText,
    handleManualCheck,
    handleInstall,
    dismissUpdate,
    loadAppInfo,
  };
}

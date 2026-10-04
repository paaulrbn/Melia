import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { LATEST_CHANGELOG } from '../data/changelog';

export function useChangelog(appVersion?: string | null) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!appVersion) return;

    const cleanVersion = appVersion.replace(/^v/, '').trim();
    const lastSeenVersion = localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);

    if (lastSeenVersion !== cleanVersion) {
      setIsOpen(true);
    }
  }, [appVersion]);

  const closeChangelog = useCallback(() => {
    setIsOpen(false);
    const versionToSave = appVersion ? appVersion.replace(/^v/, '').trim() : LATEST_CHANGELOG.version;
    localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, versionToSave);
  }, [appVersion]);

  const openChangelog = useCallback(() => {
    setIsOpen(true);
  }, []);

  return {
    isOpen,
    version: appVersion ? appVersion.replace(/^v/, '').trim() : LATEST_CHANGELOG.version,
    groups: LATEST_CHANGELOG.groups,
    openChangelog,
    closeChangelog,
  };
}

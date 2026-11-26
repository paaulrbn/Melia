import type { RootFolder } from '../types';
import { normalizeRootFolder } from './formatters';

export interface RootFolderOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Options of the root folder list and the one to select. A saved folder that the server
 * no longer lists stays as the first option, so it is never replaced silently.
 */
export function rootFolderOptions(
  folders: readonly RootFolder[],
  saved: string,
  serverName: string
): { options: RootFolderOption[]; selected: string } {
  const options = folders.map(folder => ({ value: folder.path, label: folder.path }));
  const wanted = saved.trim();
  if (!wanted) return { options, selected: '' };

  const target = normalizeRootFolder(wanted);
  const match = folders.find(folder => normalizeRootFolder(folder.path) === target);
  if (match) return { options, selected: match.path };

  return {
    options: [{ value: wanted, label: `${wanted}, absent de ${serverName}` }, ...options],
    selected: wanted,
  };
}

/** Folder to propose when none is saved and the server has exactly one. */
export function defaultRootFolder(folders: readonly RootFolder[], saved: string): string | null {
  if (saved.trim() || folders.length !== 1) return null;
  return folders[0].path;
}

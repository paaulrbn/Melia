import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { RootFolder } from '../../types';
import { fetchRadarrRootFolders } from '../../services/radarr';
import { fetchSonarrRootFolders } from '../../services/sonarr';
import { defaultRootFolder, rootFolderOptions } from '../../utils/rootFolders';
import { Input } from '../ui';

type Server = 'radarr' | 'sonarr';

const SERVER_NAMES: Record<Server, string> = { radarr: 'Radarr', sonarr: 'Sonarr' };
const FETCHERS: Record<Server, () => Promise<RootFolder[]>> = {
  radarr: fetchRadarrRootFolders,
  sonarr: fetchSonarrRootFolders,
};

/**
 * Why the list cannot be asked for: Radarr/Sonarr requests use the saved address and key
 * (held on the Rust side), so edited ones must be saved first.
 */
export type RootFolderUnavailable = 'missing' | 'unsaved' | null;

interface RootFolderPickerProps {
  readonly server: Server;
  readonly inputId: string;
  readonly value: string;
  readonly placeholder: string;
  readonly unavailable: RootFolderUnavailable;
  readonly onChange: (value: string) => void;
}

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly folders: RootFolder[] }
  | { readonly status: 'failed' };

/**
 * Root folder of Radarr or Sonarr while editing: a glass capsule like the movie page's
 * quality choice, a transparent native `<select>` over it. Back to a text field, with a
 * short note, when the list cannot be loaded or is empty.
 */
export function RootFolderPicker({
  server,
  inputId,
  value,
  placeholder,
  unavailable,
  onChange,
}: Readonly<RootFolderPickerProps>) {
  const serverName = SERVER_NAMES[server];
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  // Latest value and callback, read once the list arrives (no refetch on each keystroke)
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    if (unavailable) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    FETCHERS[server]()
      .then(folders => {
        if (cancelled) return;
        setLoad({ status: 'ready', folders });
        // Only folder and nothing saved: proposed in the form, saved with "Enregistrer"
        const proposed = defaultRootFolder(folders, latest.current.value);
        if (proposed) latest.current.onChange(proposed);
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [server, unavailable]);

  const noteId = `${inputId}-note`;
  let note: string | null = null;
  if (unavailable === 'missing') {
    note = `Renseignez l’adresse et la clé API pour choisir parmi les dossiers de ${serverName}.`;
  } else if (unavailable === 'unsaved') {
    note = `Enregistrez la nouvelle adresse ou clé API pour choisir parmi les dossiers de ${serverName}.`;
  } else if (load.status === 'failed') {
    note = `Liste des dossiers de ${serverName} indisponible. Saisissez le chemin.`;
  } else if (load.status === 'ready' && load.folders.length === 0) {
    note = `${serverName} n’a aucun dossier racine. Saisissez le chemin.`;
  }

  if (note) {
    return (
      <>
        <Input
          id={inputId}
          type="text"
          inputSize="sm"
          containerClassName="settings-row-input"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          aria-describedby={noteId}
          onChange={e => onChange(e.target.value)}
        />
        <p className="settings-row-note" id={noteId}>
          {note}
        </p>
      </>
    );
  }

  const isLoading = load.status === 'loading';
  const { options, selected } =
    load.status === 'ready'
      ? rootFolderOptions(load.folders, value, serverName)
      : { options: [], selected: '' };
  const current = options.find(option => option.value === selected);
  let shown = current?.label ?? 'Choisir un dossier';
  if (isLoading) shown = 'Chargement…';

  return (
    <div className="settings-row-input">
      <div className="settings-picker" data-disabled={isLoading ? '' : undefined}>
        <span className="settings-picker-value" aria-hidden="true">
          {shown}
        </span>
        <ChevronsUpDown className="settings-picker-chevron" size={16} aria-hidden="true" />
        <select
          id={inputId}
          className="settings-picker-select"
          value={isLoading ? '' : selected}
          disabled={isLoading}
          aria-busy={isLoading || undefined}
          onChange={e => onChange(e.target.value)}
        >
          {(isLoading || !current) && (
            <option value="" disabled>
              {isLoading ? 'Chargement…' : 'Choisir un dossier'}
            </option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { IconButton, Input } from '../ui';
import { IS_MAC } from '../../hooks/useSidebar';

const SHORTCUT_HINT = IS_MAC ? '⌘K' : 'Ctrl K';
const SHORTCUT_ARIA = IS_MAC ? 'Meta+K' : 'Control+K';

export interface PageToolbarSearch {
  readonly query: string;
  /** Accessible name of the field, e.g. "Rechercher un film". */
  readonly label: string;
  readonly placeholder: string;
  readonly onChange: (term: string) => void;
  readonly onClear: () => void;
}

export interface PageToolbarBack {
  /** True while a sub-page is open (movie detail): the button takes the title's place. */
  readonly isShown: boolean;
  /** Accessible name, e.g. "Retour aux films". The visible label is the page title. */
  readonly label: string;
  readonly onBack: () => void;
}

interface PageToolbarProps {
  /** Window bar (traffic lights, logo, sidebar toggle), kept mounted across pages. */
  readonly leading: ReactNode;
  readonly title: string;
  /** Back button shown in place of the title, with the same word, so the two never sit side by side. */
  readonly back?: PageToolbarBack;
  /** Pages without a search (downloads, settings) only show their title. */
  readonly search?: PageToolbarSearch;
  /** Content column of the page, so the title lines up with it ('narrow': downloads, settings). */
  readonly measure: 'wide' | 'narrow';
}

/**
 * Top row of the window: window bar and page title on the leading side, the page search
 * centred on the content below. The empty space stays a window drag area; the title lets
 * clicks fall through to it. On a sub-page, a back button replaces the title in the same
 * slot: its label stays where the title was, the chevron hangs in the margin before it.
 */
export function PageToolbar({ leading, title, back, search, measure }: Readonly<PageToolbarProps>) {
  const isBackShown = back?.isShown ?? false;

  return (
    <header
      className={`app-topbar${measure === 'narrow' ? ' app-topbar--narrow' : ''}`}
      data-tauri-drag-region="true"
    >
      {/* Translucent material over the content column; slides with it when the sidebar toggles */}
      <div className="app-topbar-backdrop" data-sidebar-follow="" aria-hidden="true" />
      <div className="app-topbar-lead" data-tauri-drag-region="true">
        {leading}
        <div
          className="page-toolbar-heading"
          data-state={isBackShown ? 'back' : 'title'}
          data-sidebar-follow=""
        >
          <h2 className="page-toolbar-title">{title}</h2>
          {/* No drag attribute: in Tauri only the clicked element counts, so the button
              never moves the window. Kept mounted so it can fade out. */}
          {back && (
            <button
              type="button"
              className="page-toolbar-back"
              aria-label={back.label}
              aria-keyshortcuts="Escape"
              inert={!isBackShown}
              onClick={back.onBack}
            >
              <ChevronLeft className="page-toolbar-back-icon" size={18} aria-hidden="true" />
              <span className="page-toolbar-back-label">{title}</span>
            </button>
          )}
        </div>
      </div>

      {/* Remounted per page so the field never carries one page's state to the other */}
      {search && <PageSearch key={search.label} search={search} />}
    </header>
  );
}

function PageSearch({ search }: Readonly<{ search: PageToolbarSearch }>) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K (macOS) / Ctrl+K elsewhere puts the keyboard in the search, unless a dialog is open
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = IS_MAC ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleClear = () => {
    search.onClear();
    // The clear button disappears with the text: keep the keyboard in the field
    inputRef.current?.focus();
  };

  return (
    <div className="page-toolbar-search" role="search" data-sidebar-follow="">
      <Input
        ref={inputRef}
        type="text"
        inputSize="sm"
        fullWidth
        className={search.query ? undefined : 'has-shortcut-hint'}
        aria-label={search.label}
        aria-keyshortcuts={SHORTCUT_ARIA}
        placeholder={search.placeholder}
        value={search.query}
        onChange={e => search.onChange(e.target.value)}
        leftIcon={<Search size={16} aria-hidden="true" />}
        rightElement={
          search.query ? (
            <IconButton
              icon={<X size={14} aria-hidden="true" />}
              onClick={handleClear}
              aria-label="Effacer la recherche"
              size="sm"
              shape="circle"
              variant="ghost"
              className="search-clear"
            />
          ) : (
            <kbd className="search-shortcut" aria-hidden="true">
              {SHORTCUT_HINT}
            </kbd>
          )
        }
      />
    </div>
  );
}

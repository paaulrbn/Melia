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
  /** True while a sub-page is open (movie detail): the button fades in. */
  readonly isShown: boolean;
  /** Accessible name, e.g. "Retour aux films". */
  readonly label: string;
  /** Visible word after the chevron: the page it goes back to, e.g. "Films". */
  readonly text: string;
  readonly onBack: () => void;
}

interface PageToolbarProps {
  /** Window bar (traffic lights, logo, sidebar toggle), kept mounted across pages. */
  readonly leading: ReactNode;
  /** Back button of a sub-page (movie detail), on the content's leading edge. */
  readonly back?: PageToolbarBack;
  /** Page tabs, shown in the middle of the row while the sidebar is hidden. */
  readonly tabs?: ReactNode;
  /** True while the tabs are on screen (they stay mounted to fade in and out). */
  readonly areTabsShown?: boolean;
  /** Pages without a search (downloads, settings) leave the row empty there. */
  readonly search?: PageToolbarSearch;
}

/**
 * Top row of the window: window bar (and on a sub-page the back button) on the leading
 * side, the page search centred on the content below. The page has no visible title here:
 * the sidebar, or the tabs that replace it, already say where you are. While the sidebar
 * is hidden, the tabs sit in the middle and the search moves to the trailing side.
 * The empty space stays a window drag area.
 */
export function PageToolbar({ leading, back, tabs, areTabsShown = false, search }: Readonly<PageToolbarProps>) {
  const isBackShown = back?.isShown ?? false;
  // Nothing over the content column (no back button, search or tabs): the material and
  // its fade would only blur the page under an empty row, so it fades out
  const isEmpty = !isBackShown && !search && !areTabsShown;

  return (
    <header className="app-topbar" data-tauri-drag-region="true" data-empty={isEmpty ? 'true' : 'false'}>
      {/* Translucent material over the content column; slides with it when the sidebar toggles */}
      <div className="app-topbar-backdrop" data-sidebar-follow="" aria-hidden="true" />
      <div className="app-topbar-lead" data-tauri-drag-region="true">
        {leading}
        {/* No drag attribute on the button: in Tauri only the clicked element counts, so it
            never moves the window. Kept mounted so it can fade out. */}
        {back && (
          <div
            className="page-toolbar-heading"
            data-state={isBackShown ? 'back' : 'none'}
            data-sidebar-follow=""
          >
            <button
              type="button"
              className="page-toolbar-back"
              aria-label={back.label}
              aria-keyshortcuts="Escape"
              inert={!isBackShown}
              onClick={back.onBack}
            >
              <ChevronLeft className="page-toolbar-back-icon" size={18} aria-hidden="true" />
              <span className="page-toolbar-back-label">{back.text}</span>
            </button>
          </div>
        )}
      </div>

      {tabs}

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

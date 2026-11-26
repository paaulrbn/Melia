import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { ChangelogGroup, ChangelogRelease } from '../../types';
import { Button, IconButton } from '../ui';
import { fireConfetti } from '../../utils/confetti';
import { parseInlineMarkdown } from '../../utils/inlineMarkdown';

interface ChangelogModalProps {
  readonly isOpen: boolean;
  readonly version: string;
  readonly groups: ChangelogGroup[];
  readonly onClose: () => void;
  /** Release day (YYYY-MM-DD), shown next to the version when known. */
  readonly date?: string;
  /** Earlier releases, newest first, shown folded under the current one. */
  readonly olderReleases?: readonly ChangelogRelease[];
}

type SheetState = 'closed' | 'entering' | 'open' | 'closing';

/* Must match --changelog-close-dur in changelog.css */
const CLOSE_MS = 150;

const FOCUSABLE = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function formatReleaseDate(iso: string): string | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function InlineText({ text }: { readonly text: string }) {
  return (
    <>
      {parseInlineMarkdown(text).map((token, index) => {
        const key = `${token.type}-${index}`;
        if (token.type === 'strong') return <strong key={key}>{token.value}</strong>;
        if (token.type === 'code') return <code key={key}>{token.value}</code>;
        return <span key={key}>{token.value}</span>;
      })}
    </>
  );
}

function ReleaseGroups({
  groups,
  headingLevel,
}: {
  readonly groups: readonly ChangelogGroup[];
  readonly headingLevel: 'h3' | 'h4';
}) {
  const Heading = headingLevel;
  return (
    <>
      {groups.map(group => (
        <section key={group.title} className="changelog-group">
          <Heading className="changelog-group-title">{group.title}</Heading>
          <ul className="changelog-list">
            {group.items.map(item => (
              <li key={item} className="changelog-list-item">
                <InlineText text={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ChangelogModal({
  isOpen,
  version,
  groups,
  onClose,
  date,
  olderReleases = [],
}: Readonly<ChangelogModalProps>) {
  const [state, setState] = useState<SheetState>(isOpen ? 'entering' : 'closed');
  const [scrollEdges, setScrollEdges] = useState({ top: true, bottom: true });
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Follow the parent's isOpen while keeping the sheet mounted during its exit.
  if (isOpen && (state === 'closed' || state === 'closing')) {
    setState('entering');
  } else if (!isOpen && (state === 'entering' || state === 'open')) {
    setState('closing');
  }

  const mounted = state !== 'closed';

  // Entering: paint the resting pre-open scale once, then transition to open.
  useEffect(() => {
    if (state !== 'entering') return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setState(current => (current === 'entering' ? 'open' : current)));
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    if (state !== 'closing') return;
    const timer = window.setTimeout(() => {
      setState(current => (current === 'closing' ? 'closed' : current));
    }, CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Remember where focus was, lock the page behind, and give focus back on unmount.
  useLayoutEffect(() => {
    if (!mounted) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    appRoot?.setAttribute('inert', '');
    primaryRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      appRoot?.removeAttribute('inert');
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [mounted]);

  const updateScrollEdges = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const top = body.scrollTop <= 1;
    const bottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    setScrollEdges(prev => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    updateScrollEdges();
    window.addEventListener('resize', updateScrollEdges);
    return () => window.removeEventListener('resize', updateScrollEdges);
  }, [mounted, updateScrollEdges]);

  // Escape closes the sheet before any other shortcut of the app sees it.
  useEffect(() => {
    if (state !== 'open' && state !== 'entering') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [state, onClose]);

  const handleTrapKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const focusables = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      element => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !sheetRef.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleContinue = () => {
    if (!prefersReducedMotion()) fireConfetti();
    onClose();
  };

  if (!mounted) return null;

  const formattedDate = date ? formatReleaseDate(date) : null;

  return createPortal(
    <div className="changelog-backdrop" data-state={state}>
      <div
        ref={sheetRef}
        className="changelog-sheet"
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleTrapKeyDown}
      >
        <header className="changelog-header" data-scrolled={!scrollEdges.top}>
          <div className="changelog-heading">
            <h2 id={titleId} className="changelog-title">Nouveautés de Melia</h2>
            <p className="changelog-meta">
              Version {version}
              {formattedDate && date && (
                <>
                  {' du '}
                  <time dateTime={date}>{formattedDate}</time>
                </>
              )}
            </p>
          </div>
          <IconButton
            icon={<X size={16} strokeWidth={2} aria-hidden="true" />}
            onClick={onClose}
            aria-label="Fermer"
            className="changelog-close"
            shape="circle"
            size="sm"
          />
        </header>

        <div ref={bodyRef} className="changelog-body" onScroll={updateScrollEdges}>
          <ReleaseGroups groups={groups} headingLevel="h3" />

          {olderReleases.length > 0 && (
            <details className="changelog-older" onToggle={updateScrollEdges}>
              <summary className="changelog-older-summary">
                Versions précédentes
                <ChevronDown className="changelog-older-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
              </summary>
              <div className="changelog-older-list">
                {olderReleases.map(release => {
                  const releaseDate = release.date ? formatReleaseDate(release.date) : null;
                  return (
                    <section key={release.version} className="changelog-release">
                      <h3 className="changelog-release-title">
                        Version {release.version}
                        {releaseDate && release.date && (
                          <time className="changelog-release-date" dateTime={release.date}>
                            {releaseDate}
                          </time>
                        )}
                      </h3>
                      <ReleaseGroups groups={release.groups} headingLevel="h4" />
                    </section>
                  );
                })}
              </div>
            </details>
          )}
        </div>

        <footer className="changelog-footer" data-scrolled={!scrollEdges.bottom}>
          <Button ref={primaryRef} type="button" variant="primary" size="sm" onClick={handleContinue}>
            Continuer
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

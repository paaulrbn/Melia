import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { TabType } from '../../types';
import { PAGE_ORDER, PAGE_TITLES } from './navigation';

interface TopTabsProps {
  /** Sidebar hidden: the tabs take its place in the top row (iPad style). */
  readonly isShown: boolean;
  readonly activeTab: TabType;
  readonly onSelectTab: (tab: TabType) => void;
  readonly activeDownloadCount: number;
  /** Sidebar that takes over when the tabs hide: keyboard focus moves to its current entry. */
  readonly sidebarId: string;
}

/**
 * Main pages as a floating glass capsule in the top row, shown while the sidebar is hidden.
 * Same destinations and active page as the sidebar (its movie groups stay there). Kept
 * mounted so it can fade out; hidden, it is inert, so out of the tab order and of the
 * accessibility tree. The active page is marked by a pill that slides between tabs
 * (transitions.dev tabs sliding).
 */
export function TopTabs({
  isShown,
  activeTab,
  onSelectTab,
  activeDownloadCount,
  sidebarId,
}: Readonly<TopTabsProps>) {
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const wasShownRef = useRef(isShown);
  const hasActiveDownloads = activeDownloadCount > 0;

  /** Puts the pill under the active tab; without `animate`, in place before the next paint. */
  const placePill = useCallback((animate: boolean) => {
    const nav = navRef.current;
    const pill = pillRef.current;
    const tab = nav?.querySelector<HTMLElement>('.top-tab[aria-current="page"]');
    if (!pill || !tab) return;
    const apply = () => {
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
    };
    if (animate) {
      apply();
      return;
    }
    pill.style.transition = 'none';
    apply();
    void pill.offsetWidth;
    pill.style.transition = '';
  }, []);

  // The pill slides only between two tabs on screen; when the tabs come in, it is
  // already under the active one and fades in with them
  useLayoutEffect(() => {
    const wasShown = wasShownRef.current;
    wasShownRef.current = isShown;
    placePill(wasShown && isShown);

    // Hidden while a tab had the keyboard (Cmd+B): the sidebar's current entry takes it
    const nav = navRef.current;
    if (wasShown && !isShown && nav?.contains(document.activeElement)) {
      document
        .getElementById(sidebarId)
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus({ preventScroll: true });
    }
  }, [activeTab, isShown, placePill, sidebarId]);

  // Tab widths change (fonts loaded, download count): the pill follows without sliding
  useEffect(() => {
    const list = navRef.current?.querySelector('.top-tabs-list');
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => placePill(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [placePill]);

  return (
    <nav
      ref={navRef}
      className="top-tabs"
      aria-label="Navigation principale"
      data-shown={isShown ? 'true' : 'false'}
      inert={!isShown}
    >
      <span ref={pillRef} className="top-tabs-pill" aria-hidden="true" />
      <ul className="top-tabs-list">
        {PAGE_ORDER.map((tab, index) => {
          const isActive = tab === activeTab;
          const showsCount = tab === 'downloads' && hasActiveDownloads;
          return (
            <li key={tab}>
              <button
                type="button"
                className="top-tab"
                style={{ '--tab-index': index } as CSSProperties}
                aria-current={isActive ? 'page' : undefined}
                aria-label={
                  showsCount ? `${PAGE_TITLES[tab]}, ${activeDownloadCount} en cours` : undefined
                }
                onClick={() => onSelectTab(tab)}
              >
                <span className="top-tab-label">{PAGE_TITLES[tab]}</span>
                {showsCount && (
                  <span className="top-tab-count" aria-hidden="true">
                    {activeDownloadCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

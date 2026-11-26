import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

interface SeasonTabsProps {
  readonly seasons: readonly number[];
  readonly value: number;
  readonly onChange: (season: number) => void;
  /** Prefix of the tab ids, so the episode list can be named by the active tab */
  readonly idPrefix: string;
  /** Id of the panel the tabs switch */
  readonly panelId: string;
}

export function seasonTabId(idPrefix: string, season: number): string {
  return `${idPrefix}-season-${season}`;
}

/**
 * Season picker: a segmented control whose pill slides to the chosen season (transitions.dev
 * tabs sliding). The pill is measured from the tab, written without a transition at first
 * paint and on resize, and with one when the choice changes. Arrow keys, Home and End move
 * between seasons; only the active tab is a tab stop. A long list scrolls sideways.
 */
export function SeasonTabs({ seasons, value, onChange, idPrefix, panelId }: Readonly<SeasonTabsProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const isPlacedRef = useRef(false);

  const place = (animate: boolean) => {
    const track = trackRef.current;
    const pill = pillRef.current;
    const tab = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!track || !pill || !tab) return;
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      // Flush the position before the transition comes back
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  };

  useLayoutEffect(() => {
    place(isPlacedRef.current);
    // Brings the tab into view by moving the tab strip only: scrollIntoView would also
    // scroll the page
    const scroller = scrollerRef.current;
    const tab = trackRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (isPlacedRef.current && scroller && tab) {
      const start = tab.offsetLeft;
      const end = start + tab.offsetWidth;
      if (start < scroller.scrollLeft) scroller.scrollLeft = start;
      else if (end > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = end - scroller.clientWidth;
    }
    isPlacedRef.current = true;
  }, [value, seasons]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = seasons.indexOf(value);
    let next = index;
    if (event.key === 'ArrowRight') next = Math.min(seasons.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = seasons.length - 1;
    else return;
    event.preventDefault();
    if (next === index) return;
    onChange(seasons[next]);
    document.getElementById(seasonTabId(idPrefix, seasons[next]))?.focus({ preventScroll: true });
  };

  return (
    <div ref={scrollerRef} className="season-tabs">
      <div
        ref={trackRef}
        className="season-tabs-track"
        role="tablist"
        aria-label="Saisons"
        onKeyDown={handleKeyDown}
      >
        <span ref={pillRef} className="season-tabs-pill" aria-hidden="true" />
        {seasons.map(season => {
          const isSelected = season === value;
          return (
            <button
              key={season}
              type="button"
              role="tab"
              id={seasonTabId(idPrefix, season)}
              className="season-tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(season)}
            >
              {`Saison ${season}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

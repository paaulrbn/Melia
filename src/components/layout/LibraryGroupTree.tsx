import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/** Where the dotted rail starts, from the top of the tree: just under the page's icon. */
const RAIL_START = -4;

/** One section of a library screen, as the sidebar lists it. */
export interface LibraryGroupItem<K extends string = string> {
  readonly key: K;
  readonly title: string;
  readonly count: number;
}

interface LibraryGroupTreeProps<K extends string> {
  readonly groups: readonly LibraryGroupItem<K>[];
  /** Group being read on its screen; null elsewhere. */
  readonly activeKey: K | null;
  readonly onSelect: (key: K) => void;
  /** Name of the list for screen readers ("Groupes de films"). */
  readonly label: string;
  /** What the groups hold, for the name of each button ("film" / "films"). */
  readonly noun: { readonly one: string; readonly many: string };
}

type Centers = ReadonlyMap<string, number>;

function sameCenters(a: Centers, b: Centers): boolean {
  if (a.size !== b.size) return false;
  for (const [key, y] of a) {
    if (b.get(key) !== y) return false;
  }
  return true;
}

/**
 * Position of one rail layer. While it has no target it stays where it was, hidden, and
 * the next target is reached at once (fade in place, no slide from a stale spot).
 */
function useLayerPosition(center: number | undefined) {
  const last = useRef({ y: 0, visible: false });
  const visible = center !== undefined;
  const y = center ?? last.current.y;
  const instant = !last.current.visible;

  useEffect(() => {
    last.current = { y, visible };
  });

  return { y, visible, instant };
}

interface RailLayerProps {
  readonly tone: 'hover' | 'active';
  readonly center: number | undefined;
}

/** Dotted rail from the top of the tree down to a row, ending in a hook towards its label. */
function RailLayer({ tone, center }: Readonly<RailLayerProps>) {
  const { y, visible, instant } = useLayerPosition(center);
  const style = {
    '--rail-start': `${RAIL_START}px`,
    '--rail-y': `${y}px`,
  } as CSSProperties;

  return (
    <div
      className={`sidebar-rail sidebar-rail--${tone}`}
      data-visible={visible}
      data-instant={instant || undefined}
      style={style}
    >
      <span className="sidebar-rail-line" />
      <svg className="sidebar-rail-hook" width="12" height="7" viewBox="0 0 12 7" fill="none">
        <path d="M0.5 0 a6 6 0 0 0 6 6 H12" stroke="currentColor" strokeDasharray="2 2" />
      </svg>
    </div>
  );
}

/**
 * Sections of a library screen (movies, series) listed under its sidebar entry, hanging
 * from a dotted rail. A white hook points at the group on screen; a grey one follows the
 * pointer and the keyboard focus. Positions are measured from the rows, so they follow the
 * number of groups, the font and the window size.
 */
export function LibraryGroupTree<K extends string>({
  groups,
  activeKey,
  onSelect,
  label,
  noun,
}: Readonly<LibraryGroupTreeProps<K>>) {
  const treeRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [centers, setCenters] = useState<Centers>(() => new Map());
  const centersRef = useRef<Centers>(centers);
  const [hoveredKey, setHoveredKey] = useState<K | null>(null);
  /** Group reached with the keyboard: the grey hook follows it like the pointer. */
  const [focusedKey, setFocusedKey] = useState<K | null>(null);
  /** The layout itself moved (first render, font, resize, groups): place the hooks without sliding. */
  const [isJumping, setIsJumping] = useState(true);

  const measure = useCallback(() => {
    const next = new Map<string, number>();
    buttons.current.forEach((button, key) => {
      next.set(key, button.offsetTop + button.offsetHeight / 2);
    });
    if (sameCenters(centersRef.current, next)) return;
    centersRef.current = next;
    setCenters(next);
    setIsJumping(true);
  }, []);

  useLayoutEffect(measure, [measure, groups]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return undefined;
    let isMounted = true;
    const observer = new ResizeObserver(() => measure());
    observer.observe(tree);
    void document.fonts?.ready.then(() => {
      if (isMounted) measure();
    });
    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [measure]);

  // Transitions come back once the jump has been painted
  useEffect(() => {
    if (!isJumping) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setIsJumping(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [isJumping]);

  const activeCenter = activeKey ? centers.get(activeKey) : undefined;
  // Pointer first, then keyboard focus; at rest the grey hook hides under the white one
  const hoverKey = hoveredKey ?? focusedKey ?? activeKey;
  const hoverCenter = hoverKey ? centers.get(hoverKey) : undefined;

  return (
    <div
      ref={treeRef}
      className={`sidebar-tree${isJumping ? ' is-jumping' : ''}`}
    >
      <div className="sidebar-rails" aria-hidden="true">
        <RailLayer tone="hover" center={hoverCenter} />
        <RailLayer tone="active" center={activeCenter} />
      </div>
      <ul
        className="sidebar-sublist"
        aria-label={label}
        onPointerLeave={() => setHoveredKey(null)}
      >
        {groups.map(group => {
          const isCurrent = group.key === activeKey;
          return (
            <li key={group.key}>
              <button
                ref={element => {
                  if (element) buttons.current.set(group.key, element);
                  else buttons.current.delete(group.key);
                }}
                type="button"
                className={`sidebar-sublink${isCurrent ? ' is-current' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`${group.title}, ${group.count} ${group.count > 1 ? noun.many : noun.one}`}
                onClick={() => onSelect(group.key)}
                onPointerEnter={() => setHoveredKey(group.key)}
                // Same rule as the CSS: only a visible (keyboard) focus counts, not a click
                onFocus={event => {
                  if (event.currentTarget.matches(':focus-visible')) setFocusedKey(group.key);
                }}
                onBlur={() => setFocusedKey(null)}
              >
                <span className="sidebar-sublink-label">{group.title}</span>
                <span className="sidebar-sublink-count">{group.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

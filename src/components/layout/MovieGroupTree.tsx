import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MovieGroup, MovieGroupKey } from '../../utils/movieGroups';

/** Where the dotted rail starts, from the top of the tree: just under the "Films" icon. */
const RAIL_START = -4;

interface MovieGroupTreeProps {
  readonly groups: readonly MovieGroup[];
  /** Group being read on the movies screen; null elsewhere. */
  readonly activeKey: MovieGroupKey | null;
  readonly onSelect: (key: MovieGroupKey) => void;
}

type Centers = ReadonlyMap<MovieGroupKey, number>;

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
 * Library groups under "Films", hanging from a dotted rail. A white hook points at the
 * group on screen; a grey one follows the pointer and the keyboard focus. Positions are measured from the rows,
 * so they follow the number of groups, the font and the window size.
 */
export function MovieGroupTree({ groups, activeKey, onSelect }: Readonly<MovieGroupTreeProps>) {
  const treeRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<MovieGroupKey, HTMLButtonElement>());
  const [centers, setCenters] = useState<Centers>(() => new Map());
  const centersRef = useRef<Centers>(centers);
  const [hoveredKey, setHoveredKey] = useState<MovieGroupKey | null>(null);
  /** Group reached with the keyboard: the grey hook follows it like the pointer. */
  const [focusedKey, setFocusedKey] = useState<MovieGroupKey | null>(null);
  /** The layout itself moved (first render, font, resize, groups): place the hooks without sliding. */
  const [isJumping, setIsJumping] = useState(true);

  const measure = useCallback(() => {
    const next = new Map<MovieGroupKey, number>();
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
        aria-label="Groupes de films"
        onPointerLeave={() => setHoveredKey(null)}
      >
        {groups.map(group => {
          const count = group.movies.length;
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
                aria-label={`${group.title}, ${count} ${count > 1 ? 'films' : 'film'}`}
                onClick={() => onSelect(group.key)}
                onPointerEnter={() => setHoveredKey(group.key)}
                // Same rule as the CSS: only a visible (keyboard) focus counts, not a click
                onFocus={event => {
                  if (event.currentTarget.matches(':focus-visible')) setFocusedKey(group.key);
                }}
                onBlur={() => setFocusedKey(null)}
              >
                <span className="sidebar-sublink-label">{group.title}</span>
                <span className="sidebar-sublink-count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

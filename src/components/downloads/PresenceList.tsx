import { useLayoutEffect, useReducer, useRef, type ReactNode } from 'react';

export interface PresenceItem {
  readonly key: string;
  readonly node: ReactNode;
}

interface Slot extends PresenceItem {
  readonly leaving: boolean;
}

interface PresenceListProps {
  readonly items: readonly PresenceItem[];
  readonly className?: string;
  readonly 'aria-label'?: string;
}

/** Same as --dl-row-exit in downloads.css */
const EXIT_MS = 150;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Current items in order, plus the ones that just left, kept where they were. */
function mergeSlots(previous: readonly Slot[], items: readonly PresenceItem[], gone: ReadonlySet<string>): Slot[] {
  const result: Slot[] = items.map(item => ({ ...item, leaving: false }));
  const currentKeys = new Set(items.map(item => item.key));

  previous.forEach((slot, index) => {
    if (currentKeys.has(slot.key) || gone.has(slot.key)) return;
    // After the row that preceded it, else at the top
    const before = index > 0 ? previous[index - 1].key : null;
    const at = before === null ? -1 : result.findIndex(s => s.key === before);
    result.splice(at + 1, 0, { ...slot, leaving: true });
  });

  return result;
}

/**
 * List whose rows grow in when they appear and fold away when they go, instead of
 * popping. Rows present on the first render show at once (no entrance on page load).
 * A leaving row stays a moment, inert, with its last content.
 */
export function PresenceList({ items, className, 'aria-label': ariaLabel }: Readonly<PresenceListProps>) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const lastRef = useRef<Slot[]>([]);
  const goneRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, number>>(new Map());
  const enteringRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);

  const slots = mergeSlots(lastRef.current, items, goneRef.current);

  if (mountedRef.current) {
    const known = new Set(lastRef.current.map(slot => slot.key));
    for (const slot of slots) {
      if (!slot.leaving && !known.has(slot.key)) enteringRef.current.add(slot.key);
    }
  }

  useLayoutEffect(() => {
    mountedRef.current = true;
    lastRef.current = slots;
    // Dropped from this render: nothing can bring them back now
    goneRef.current.clear();

    const timers = timersRef.current;
    const present = new Set(slots.map(slot => slot.key));
    for (const key of enteringRef.current) {
      if (!present.has(key)) enteringRef.current.delete(key);
    }

    for (const slot of slots) {
      const timer = timers.get(slot.key);
      if (!slot.leaving) {
        // Came back before the end of its exit
        if (timer !== undefined) {
          window.clearTimeout(timer);
          timers.delete(slot.key);
        }
        continue;
      }
      if (timer !== undefined) continue;
      timers.set(
        slot.key,
        window.setTimeout(
          () => {
            timers.delete(slot.key);
            enteringRef.current.delete(slot.key);
            goneRef.current.add(slot.key);
            forceRender();
          },
          prefersReducedMotion() ? 0 : EXIT_MS
        )
      );
    }
  });

  useLayoutEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ul className={className} aria-label={ariaLabel}>
      {slots.map(slot => (
        <li
          key={slot.key}
          className="dl-slot"
          data-presence={slot.leaving ? 'leaving' : undefined}
          data-enter={enteringRef.current.has(slot.key) ? '' : undefined}
          inert={slot.leaving}
          aria-hidden={slot.leaving || undefined}
        >
          <div className="dl-slot-inner">{slot.node}</div>
        </li>
      ))}
    </ul>
  );
}

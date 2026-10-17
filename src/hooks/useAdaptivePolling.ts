import { useEffect } from 'react';

/**
 * Reusable adaptive polling hook:
 * - Suspended when application tab or window is in background / hidden
 * - 3 seconds interval when active items are present
 * - 15 seconds interval when queue is idle
 * - Immediate wake-up on window focus / visibility restoration
 */
export function useAdaptivePolling(
  pollFn: () => Promise<boolean>,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;
    // Invariant: at most one pending timer or one in-flight request at any time.
    let inFlight = false;

    const poll = async () => {
      if (isCancelled || inFlight) return;

      if (document.visibilityState === 'hidden') {
        return;
      }

      inFlight = true;
      let hasActiveItems = false;
      try {
        hasActiveItems = await pollFn();
      } catch {
        hasActiveItems = false;
      } finally {
        inFlight = false;
      }

      if (!isCancelled) {
        if (timeoutId) clearTimeout(timeoutId);
        const delay = hasActiveItems ? 3000 : 15000;
        timeoutId = setTimeout(() => void poll(), delay);
      }
    };

    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
        void poll();
      }
    };

    void poll();
    window.addEventListener('focus', handleWakeup);
    document.addEventListener('visibilitychange', handleWakeup);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('focus', handleWakeup);
      document.removeEventListener('visibilitychange', handleWakeup);
    };
  }, [pollFn, enabled]);
}

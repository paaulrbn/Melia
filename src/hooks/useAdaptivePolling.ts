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

    const poll = async () => {
      if (isCancelled) return;

      if (document.visibilityState === 'hidden') {
        return;
      }

      const hasActiveItems = await pollFn();

      if (!isCancelled) {
        const delay = hasActiveItems ? 3000 : 15000;
        timeoutId = setTimeout(poll, delay);
      }
    };

    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        if (timeoutId) clearTimeout(timeoutId);
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

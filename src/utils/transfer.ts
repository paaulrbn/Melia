import { formatDuration } from './formatters';

/** Time left in words, rounded to the minute: "reste 12 min", "reste 1 h 5 min". */
export function formatTimeLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return 'reste moins d’une minute';
  return `reste ${formatDuration(Math.round(seconds / 60))}`;
}

/** Radarr / Sonarr queue time left: "HH:MM:SS" or "D.HH:MM:SS". */
export function parseQueueTimeLeft(timeleft?: string): number {
  const match = timeleft ? /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(timeleft) : null;
  if (!match) return 0;
  const [, days = '0', hours, minutes, seconds] = match;
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Local time left as written by formatTime: "1h 2m", "12m 5s", "40s". */
export function parseLocalTimeLeft(text?: string): number {
  if (!text) return 0;
  const part = (unit: string) => Number(new RegExp(`(\\d+)${unit}`).exec(text)?.[1] ?? 0);
  return part('h') * 3600 + part('m') * 60 + part('s');
}

// One decimal with the French comma ("14,6"). No thousands grouping: a value never
// goes above 1023,9 in its unit, so "1023,9 Mo" stays readable without a narrow space.
const oneDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0\u00A0Ko';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : oneDecimal.format(value)}\u00A0${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1);
  const value = bytesPerSec / Math.pow(1024, i);
  return `${oneDecimal.format(value)}\u00A0${units[i]}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h\u00A0${m}m`;
  if (m > 0) return `${m}m\u00A0${s}s`;
  return `${s}s`;
}

export function formatDuration(minutes?: number): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) {
    return m > 0 ? `${h}\u00A0h\u00A0${m}\u00A0min` : `${h}\u00A0h`;
  }
  return `${m}\u00A0min`;
}

export function normalizeRootFolder(folder?: string, defaultFolder: string = ''): string {
  let clean = (folder || '').trim();
  if (clean && !clean.startsWith('/') && !/^[a-zA-Z]:/.test(clean)) {
    clean = '/' + clean;
  }
  while (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean || defaultFolder;
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0\u00A0Ko';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)}\u00A0${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1);
  const value = bytesPerSec / Math.pow(1024, i);
  return `${value.toFixed(1)}\u00A0${units[i]}`;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h\u00A0${m}m`;
  if (m > 0) return `${m}m\u00A0${s}s`;
  return `${s}s`;
}

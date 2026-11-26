import { describe, expect, it } from 'vitest';
import { formatTimeLeft, parseLocalTimeLeft, parseQueueTimeLeft } from './transfer';

describe('formatTimeLeft', () => {
  it('rounds to the minute', () => {
    expect(formatTimeLeft(12 * 60 + 20)).toBe('reste 12 min');
    expect(formatTimeLeft(3900)).toBe('reste 1 h 5 min');
  });

  it('says less than a minute, or nothing', () => {
    expect(formatTimeLeft(30)).toBe('reste moins d’une minute');
    expect(formatTimeLeft(0)).toBe('');
    expect(formatTimeLeft(Number.NaN)).toBe('');
  });
});

describe('parseQueueTimeLeft', () => {
  it('reads the queue format, with or without days', () => {
    expect(parseQueueTimeLeft('00:12:05')).toBe(725);
    expect(parseQueueTimeLeft('1.02:00:00')).toBe(93600);
    expect(parseQueueTimeLeft(undefined)).toBe(0);
    expect(parseQueueTimeLeft('bientôt')).toBe(0);
  });
});

describe('parseLocalTimeLeft', () => {
  it('reads the local format', () => {
    expect(parseLocalTimeLeft('1h 2m')).toBe(3720);
    expect(parseLocalTimeLeft('12m 5s')).toBe(725);
    expect(parseLocalTimeLeft('40s')).toBe(40);
    expect(parseLocalTimeLeft('')).toBe(0);
  });
});

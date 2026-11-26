import { describe, expect, it } from 'vitest';
import { formatSize, formatSpeed } from './formatters';

const GO = 1024 ** 3;
const MO = 1024 ** 2;

describe('formatSize', () => {
  it('uses the French decimal comma', () => {
    expect(formatSize(14.6 * GO)).toBe('14,6 Go');
  });

  it('keeps one decimal for whole values', () => {
    expect(formatSize(512 * MO)).toBe('512,0 Mo');
  });

  it('handles zero and bytes', () => {
    expect(formatSize(0)).toBe('0 Ko');
    expect(formatSize(500)).toBe('500 o');
  });

  it('uses a non-breaking space before the unit and no dot', () => {
    const text = formatSize(1.5 * GO);
    expect(text).toBe('1,5 Go');
    expect(text).not.toContain('.');
  });

  it('does not group thousands', () => {
    expect(formatSize(1000 * MO)).toBe('1000,0 Mo');
  });
});

describe('formatSpeed', () => {
  it('uses the French decimal comma', () => {
    expect(formatSpeed(2.5 * MO)).toBe('2,5 Mo/s');
  });

  it('returns an empty string without speed', () => {
    expect(formatSpeed(0)).toBe('');
  });

  it('uses a non-breaking space before the unit', () => {
    expect(formatSpeed(1536)).toBe('1,5 Ko/s');
  });
});

import { describe, expect, it } from 'vitest';
import { searchKey } from './search';

describe('searchKey', () => {
  it('ignores case', () => {
    expect(searchKey('Breaking Bad')).toBe(searchKey('breaking bad'));
  });

  it('ignores spaces at the ends and repeated spaces', () => {
    expect(searchKey('  breaking   bad ')).toBe('breaking bad');
    expect(searchKey('Dune ')).toBe(searchKey('dune'));
  });

  it('keeps accents and different words apart', () => {
    expect(searchKey('Amélie')).toBe('amélie');
    expect(searchKey('dune')).not.toBe(searchKey('dunes'));
  });

  it('is empty for blank terms', () => {
    expect(searchKey('   ')).toBe('');
  });
});

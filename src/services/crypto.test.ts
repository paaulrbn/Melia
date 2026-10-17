import { describe, expect, it } from 'vitest';
import { validateConfigShape } from './crypto';

describe('validateConfigShape', () => {
  it('keeps known keys with text values', () => {
    const config = validateConfigShape({
      RADARR_BASE_URL: 'https://radarr.example.com',
      RADARR_API_KEY: 'abc',
    });
    expect(config).toEqual({
      RADARR_BASE_URL: 'https://radarr.example.com',
      RADARR_API_KEY: 'abc',
    });
  });

  it('drops unknown keys', () => {
    const config = validateConfigShape({ RADARR_API_KEY: 'abc', EVIL: 'x', __proto__x: 'y' });
    expect(Object.keys(config)).toEqual(['RADARR_API_KEY']);
  });

  it('rejects values that are not text', () => {
    expect(() => validateConfigShape({ RADARR_API_KEY: 42 })).toThrow();
    expect(() => validateConfigShape({ RADARR_API_KEY: { nested: true } })).toThrow();
  });

  it('rejects payloads that are not a flat object', () => {
    expect(() => validateConfigShape(null)).toThrow();
    expect(() => validateConfigShape('text')).toThrow();
    expect(() => validateConfigShape(['RADARR_API_KEY'])).toThrow();
  });
});

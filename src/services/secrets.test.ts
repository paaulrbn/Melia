import { describe, expect, it } from 'vitest';
import { mergeSecrets, splitConfig } from './secrets';

describe('splitConfig', () => {
  it('separates secrets from public values and drops empty secrets', () => {
    const { publicPart, secrets } = splitConfig({
      RADARR_BASE_URL: 'https://radarr.example.com',
      RADARR_API_KEY: 'abc',
      SONARR_API_KEY: '',
      MEDIA_SERVER_PASSWORD: 'pw',
    });
    expect(publicPart).toEqual({ RADARR_BASE_URL: 'https://radarr.example.com' });
    expect(secrets).toEqual({ RADARR_API_KEY: 'abc', MEDIA_SERVER_PASSWORD: 'pw' });
  });
});

describe('mergeSecrets', () => {
  it('prefers clear text left in localStorage, then the current entry, then old entries', () => {
    const merged = mergeSecrets(
      { RADARR_API_KEY: 'old', SONARR_API_KEY: 'old', MEDIA_SERVER_PASSWORD: 'old' },
      { RADARR_API_KEY: 'current', SONARR_API_KEY: 'current' },
      { RADARR_API_KEY: 'local' }
    );
    expect(merged).toEqual({
      RADARR_API_KEY: 'local',
      SONARR_API_KEY: 'current',
      MEDIA_SERVER_PASSWORD: 'old',
    });
  });

  it('keeps every secret when the sources do not overlap', () => {
    const merged = mergeSecrets({ RADARR_API_KEY: 'a' }, { SONARR_API_KEY: 'b' }, { MEDIA_SERVER_PASSWORD: 'c' });
    expect(Object.keys(merged).sort()).toEqual(['MEDIA_SERVER_PASSWORD', 'RADARR_API_KEY', 'SONARR_API_KEY']);
  });
});

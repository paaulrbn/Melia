import { describe, expect, it } from 'vitest';
import { defaultRootFolder, rootFolderOptions } from './rootFolders';

describe('rootFolderOptions', () => {
  const folders = [
    { id: 1, path: '/movies/', freeSpace: 1024 ** 4 },
    { id: 2, path: '/data/films' },
  ];

  it('labels each option with the path alone', () => {
    const { options } = rootFolderOptions(folders, '', 'Radarr');
    expect(options.map(option => option.label)).toEqual(['/movies/', '/data/films']);
  });

  it('selects the listed folder matching the saved one, ignoring a trailing slash', () => {
    const { options, selected } = rootFolderOptions(folders, '/movies', 'Radarr');
    expect(selected).toBe('/movies/');
    expect(options).toHaveLength(2);
  });

  it('keeps a saved folder the server no longer lists', () => {
    const { options, selected } = rootFolderOptions(folders, '/old', 'Radarr');
    expect(selected).toBe('/old');
    expect(options[0]).toEqual({ value: '/old', label: '/old, absent de Radarr' });
    expect(options).toHaveLength(3);
  });

  it('selects nothing when no folder is saved', () => {
    expect(rootFolderOptions(folders, '', 'Radarr').selected).toBe('');
  });
});

describe('defaultRootFolder', () => {
  it('proposes the only folder when none is saved', () => {
    expect(defaultRootFolder([{ id: 1, path: '/tv' }], '')).toBe('/tv');
  });

  it('proposes nothing when a folder is saved or several exist', () => {
    expect(defaultRootFolder([{ id: 1, path: '/tv' }], '/series')).toBeNull();
    expect(
      defaultRootFolder(
        [
          { id: 1, path: '/tv' },
          { id: 2, path: '/anime' },
        ],
        ''
      )
    ).toBeNull();
  });
});

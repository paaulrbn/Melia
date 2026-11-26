import { describe, expect, it } from 'vitest';
import { parseInlineMarkdown } from './inlineMarkdown';

describe('parseInlineMarkdown', () => {
  it('keeps plain text as a single token', () => {
    expect(parseInlineMarkdown('Textes plus lisibles')).toEqual([
      { type: 'text', value: 'Textes plus lisibles' },
    ]);
  });

  it('splits bold and code parts', () => {
    expect(parseInlineMarkdown('Lecture avec **IINA** ou `mpv` désormais')).toEqual([
      { type: 'text', value: 'Lecture avec ' },
      { type: 'strong', value: 'IINA' },
      { type: 'text', value: ' ou ' },
      { type: 'code', value: 'mpv' },
      { type: 'text', value: ' désormais' },
    ]);
  });

  it('leaves unmatched markers as text', () => {
    expect(parseInlineMarkdown('Un **seul marqueur')).toEqual([
      { type: 'text', value: 'Un **seul marqueur' },
    ]);
  });

  it('returns nothing for an empty line', () => {
    expect(parseInlineMarkdown('')).toEqual([]);
  });
});

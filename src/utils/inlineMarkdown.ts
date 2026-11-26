export interface InlineToken {
  readonly type: 'text' | 'strong' | 'code';
  readonly value: string;
}

const INLINE_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * Splits a changelog line into plain text, **bold** and `code` parts.
 * Anything else stays as plain text, so the result is always safe to render.
 */
export function parseInlineMarkdown(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: 'text', value: input.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ type: 'strong', value: match[1] });
    else tokens.push({ type: 'code', value: match[2] });
    last = index + match[0].length;
  }

  if (last < input.length) tokens.push({ type: 'text', value: input.slice(last) });
  return tokens;
}

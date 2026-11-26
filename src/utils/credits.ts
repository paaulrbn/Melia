import { MovieCredit } from '../types';

/** Directors of a movie, in Radarr's order, without blanks or duplicates. */
export function extractDirectors(credits: readonly MovieCredit[] | null | undefined): string[] {
  if (!Array.isArray(credits)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const credit of credits) {
    if (credit?.type !== 'crew' || credit.job !== 'Director') continue;
    const name = credit.personName?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** "A", "A et B", "A, B et C". */
export function formatNameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

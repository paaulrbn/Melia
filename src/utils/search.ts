/**
 * Key of a search term: no case, no spaces at the ends, one space between words. Two terms
 * with the same key give the same results, so changing one into the other (autocorrect
 * adding a capital or a space) does not start a new search.
 */
export function searchKey(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

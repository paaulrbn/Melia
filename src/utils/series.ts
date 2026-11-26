import type { Episode, SeasonInfo } from '../types';

/** Sonarr status in words: "En cours", "Terminée"… */
export function getSeriesStatusText(status?: string): string {
  if (status === 'continuing') return 'En cours';
  if (status === 'ended') return 'Terminée';
  if (status === 'upcoming') return 'À venir';
  return '';
}

/** "1 saison", "3 saisons". */
export function formatSeasonCount(count: number): string {
  return `${count} saison${count > 1 ? 's' : ''}`;
}

/** "12 / 24 épisodes", kept on one line by non-breaking spaces. */
export function formatEpisodeCount(withFile: number, total: number): string {
  return `${withFile} / ${total} épisode${total > 1 ? 's' : ''}`;
}

/** "S01E03". */
export function formatEpisodeTag(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

/** Real seasons in order (specials, season 0, left out); season 1 when the list is empty. */
export function getSeasonNumbers(seasons?: readonly Pick<SeasonInfo, 'seasonNumber'>[]): number[] {
  if (!seasons || seasons.length === 0) return [1];
  const numbers = seasons.map(season => season.seasonNumber).filter(number => number > 0);
  return numbers.length > 0 ? numbers.sort((a, b) => a - b) : [1];
}

/** Season, then episode number. Does not change the array it receives. */
export function sortEpisodes<T extends Pick<Episode, 'seasonNumber' | 'episodeNumber'>>(episodes: readonly T[]): T[] {
  return [...episodes].sort((a, b) =>
    a.seasonNumber === b.seasonNumber ? a.episodeNumber - b.episodeNumber : a.seasonNumber - b.seasonNumber
  );
}

/** Why an episode is not on the server: not aired yet, aired but absent, or just not there. */
export type EpisodeAbsence = 'upcoming' | 'missing' | 'unavailable';

/**
 * Null when the episode is on the server or on its way; else the reason it is not.
 * "À venir" wins over the rest: nothing can be fetched before it airs.
 */
export function getEpisodeAbsence(
  episode: Pick<Episode, 'hasFile' | 'monitored' | 'airDateUtc'>,
  hasTransfer: boolean,
  now: number = Date.now()
): EpisodeAbsence | null {
  if (episode.hasFile || hasTransfer) return null;
  if (episode.airDateUtc && new Date(episode.airDateUtc).getTime() > now) return 'upcoming';
  return isEpisodeMissing(episode, hasTransfer, now) ? 'missing' : 'unavailable';
}

/** "12 janv." in the current year, "12 janv. 2027" in another one. */
export function formatAirDate(airDateUtc: string, now: number = Date.now()): string {
  const date = new Date(airDateUtc);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Grey mention of an absent episode: "À venir, 12 janv.", "Manquant", "Pas encore sur le serveur". */
export function describeEpisodeAbsence(
  absence: EpisodeAbsence,
  airDateUtc?: string,
  now: number = Date.now()
): string {
  if (absence === 'upcoming') {
    const date = airDateUtc ? formatAirDate(airDateUtc, now) : '';
    return date ? `À venir, ${date}` : 'À venir';
  }
  return absence === 'missing' ? 'Manquant' : 'Pas encore sur le serveur';
}

/** Aired, watched by Sonarr, without a file and with nothing on its way. */
export function isEpisodeMissing(
  episode: Pick<Episode, 'hasFile' | 'monitored' | 'airDateUtc'>,
  hasTransfer: boolean,
  now: number = Date.now()
): boolean {
  if (episode.hasFile || !episode.monitored || hasTransfer) return false;
  return !episode.airDateUtc || new Date(episode.airDateUtc).getTime() <= now;
}

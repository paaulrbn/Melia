import { Episode, EpisodeFile, LookupSeries, QualityProfile, Series, UnifiedQueueItem } from '../types';
import { normalizeRootFolder } from '../utils/formatters';
import { invokeSynced } from './runtime';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Sonarr base URL and API key live on the Rust side: only a relative `/api/v3/...` path is sent. */
function sonarrRequest(method: HttpMethod, path: string, body?: unknown): Promise<string> {
  return invokeSynced<string>('sonarr_request', {
    method,
    path,
    body: body === undefined ? null : JSON.stringify(body),
  });
}

export async function fetchSonarrSeries(): Promise<Series[]> {
  const data: Series[] = JSON.parse(await sonarrRequest('GET', '/api/v3/series'));
  return data.reverse();
}

export async function fetchSonarrSeriesDetail(seriesId: number): Promise<Series> {
  return JSON.parse(await sonarrRequest('GET', `/api/v3/series/${seriesId}`));
}

export async function searchSonarrSeries(term: string): Promise<LookupSeries[]> {
  return JSON.parse(await sonarrRequest('GET', `/api/v3/series/lookup?term=${encodeURIComponent(term)}`));
}

export async function fetchSonarrQualityProfiles(): Promise<QualityProfile[]> {
  return JSON.parse(await sonarrRequest('GET', '/api/v3/qualityprofile'));
}

export async function fetchSonarrRootFolders(): Promise<{ path: string }[]> {
  return JSON.parse(await sonarrRequest('GET', '/api/v3/rootfolder'));
}

export async function fetchSonarrEpisodes(seriesId: number): Promise<Episode[]> {
  return JSON.parse(await sonarrRequest('GET', `/api/v3/episode?seriesId=${seriesId}`));
}

export async function fetchSonarrEpisodeFiles(seriesId: number): Promise<EpisodeFile[]> {
  return JSON.parse(await sonarrRequest('GET', `/api/v3/episodefile?seriesId=${seriesId}`));
}

export interface AddSeriesParams {
  rootFolder: string;
  tvdbId: number;
  title: string;
  year?: number;
  qualityProfileId: number;
  seasons?: { seasonNumber: number; monitored: boolean }[];
}

export async function addSonarrSeries(params: AddSeriesParams): Promise<Series> {
  const { rootFolder, tvdbId, title, year, qualityProfileId, seasons } = params;
  const cleanRoot = normalizeRootFolder(rootFolder, '/tv');

  const payload: Record<string, unknown> = {
    tvdbId,
    title,
    qualityProfileId,
    rootFolderPath: cleanRoot,
    monitored: true,
    seasonFolder: true,
    addOptions: {
      searchForMissingEpisodes: false,
      ignoreEpisodesWithFiles: false,
      ignoreEpisodesWithoutFiles: false,
    },
  };
  if (year) {
    payload.year = year;
  }
  if (seasons && seasons.length > 0) {
    payload.seasons = seasons;
  }

  return JSON.parse(await sonarrRequest('POST', '/api/v3/series', payload));
}

export async function triggerSonarrEpisodeSearch(episodeIds: number[]): Promise<void> {
  await sonarrRequest('POST', '/api/v3/command', {
    name: 'EpisodeSearch',
    episodeIds,
  });
}

export async function triggerSonarrSeasonSearch(seriesId: number, seasonNumber: number): Promise<void> {
  await sonarrRequest('POST', '/api/v3/command', {
    name: 'SeasonSearch',
    seriesId,
    seasonNumber,
  });
}

export async function deleteSonarrSeries(seriesId: number): Promise<void> {
  await sonarrRequest('DELETE', `/api/v3/series/${seriesId}?deleteFiles=true`);
}

export async function deleteSonarrEpisodeFile(episodeFileId: number): Promise<void> {
  await sonarrRequest('DELETE', `/api/v3/episodefile/${episodeFileId}`);
}

export async function deleteSonarrQueueItem(queueId: number): Promise<void> {
  await sonarrRequest('DELETE', `/api/v3/queue/${queueId}?removeFromClient=true&blocklist=false`);
}

/** Sonarr queue record, as returned by the API (only the fields we read). */
interface SonarrQueueApiRecord {
  id?: number;
  episodeId?: number;
  seriesId?: number;
  title?: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  status?: string;
  trackedDownloadStatus?: string;
  episode?: { id?: number; seasonNumber?: number; episodeNumber?: number; title?: string };
  series?: { id?: number; title?: string };
}

export async function fetchSonarrQueue(): Promise<UnifiedQueueItem[]> {
  const data: { records?: SonarrQueueApiRecord[] } | null = JSON.parse(
    await sonarrRequest('GET', '/api/v3/queue?includeSeries=true&includeEpisode=true')
  );

  const items: UnifiedQueueItem[] = [];
  if (data && Array.isArray(data.records)) {
    data.records.forEach(record => {
      const episode = record.episode;
      const series = record.series;
      const episodeId = record.episodeId || episode?.id;
      const seriesId = record.seriesId || series?.id;
      const seasonNum = episode?.seasonNumber;
      const epNum = episode?.episodeNumber;
      const epTitle = episode?.title || '';
      const seriesTitle = series?.title || record.title || 'Série';

      let subTitle: string | undefined;
      if (seasonNum !== undefined && epNum !== undefined) {
        const sStr = String(seasonNum).padStart(2, '0');
        const eStr = String(epNum).padStart(2, '0');
        const titleSuffix = epTitle ? ` • ${epTitle}` : '';
        subTitle = `S${sStr}E${eStr}${titleSuffix}`;
      } else {
        subTitle = epTitle || undefined;
      }

      const fallbackId = record.id ?? episodeId ?? crypto.randomUUID();

      items.push({
        id: `sonarr-${fallbackId}`,
        mediaType: 'episode',
        mediaId: episodeId || 0,
        seriesId,
        seasonNumber: seasonNum,
        episodeNumber: epNum,
        title: seriesTitle,
        subTitle,
        size: record.size || 0,
        sizeleft: record.sizeleft || 0,
        timeleft: record.timeleft,
        status: record.status,
        trackedDownloadStatus: record.trackedDownloadStatus,
        queueId: typeof record.id === 'number' ? record.id : undefined,
      });
    });
  }
  return items;
}

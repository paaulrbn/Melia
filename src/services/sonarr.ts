import { invoke } from '@tauri-apps/api/core';
import { Episode, EpisodeFile, LookupSeries, QualityProfile, Series, UnifiedQueueItem } from '../types';
import { normalizeRootFolder } from '../utils/formatters';

export async function fetchSonarrSeries(baseUrl: string, apiKey: string): Promise<Series[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/series?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('fetch_sonarr_series', { url });
  const data: Series[] = JSON.parse(jsonStr);
  return data.reverse();
}

export async function fetchSonarrSeriesDetail(baseUrl: string, apiKey: string, seriesId: number): Promise<Series> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/series/${seriesId}?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('fetch_sonarr_series', { url });
  return JSON.parse(jsonStr);
}

export async function searchSonarrSeries(baseUrl: string, apiKey: string, term: string): Promise<LookupSeries[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/series/lookup?term=${encodeURIComponent(term)}&apiKey=${apiKey}`;
  const jsonStr: string = await invoke('search_sonarr_series', { url });
  return JSON.parse(jsonStr);
}

export async function fetchSonarrQualityProfiles(baseUrl: string, apiKey: string): Promise<QualityProfile[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/qualityprofile?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('get_sonarr_quality_profiles', { url });
  return JSON.parse(jsonStr);
}

export async function fetchSonarrRootFolders(baseUrl: string, apiKey: string): Promise<{ path: string }[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/rootfolder?apiKey=${apiKey}`;
  const jsonStr: string = await invoke('get_sonarr_root_folders', { url });
  return JSON.parse(jsonStr);
}

export async function fetchSonarrEpisodes(baseUrl: string, apiKey: string, seriesId: number): Promise<Episode[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/episode?seriesId=${seriesId}&apiKey=${apiKey}`;
  const jsonStr: string = await invoke('get_sonarr_episodes', { url });
  return JSON.parse(jsonStr);
}

export async function fetchSonarrEpisodeFiles(baseUrl: string, apiKey: string, seriesId: number): Promise<EpisodeFile[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/episodefile?seriesId=${seriesId}&apiKey=${apiKey}`;
  const jsonStr: string = await invoke('get_sonarr_episode_files', { url });
  return JSON.parse(jsonStr);
}

export interface AddSeriesParams {
  baseUrl: string;
  apiKey: string;
  rootFolder: string;
  tvdbId: number;
  title: string;
  year?: number;
  qualityProfileId: number;
  seasons?: { seasonNumber: number; monitored: boolean }[];
}

export async function addSonarrSeries(params: AddSeriesParams): Promise<Series> {
  const { baseUrl, apiKey, rootFolder, tvdbId, title, year, qualityProfileId, seasons } = params;
  const cleanRoot = normalizeRootFolder(rootFolder, '/tv');

  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/series?apiKey=${apiKey}`;
  const payload: any = {
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

  const jsonStr: string = await invoke('add_sonarr_series', { url, body: JSON.stringify(payload) });
  return JSON.parse(jsonStr);
}


export async function triggerSonarrEpisodeSearch(baseUrl: string, apiKey: string, episodeIds: number[]): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/command?apiKey=${apiKey}`;
  const body = JSON.stringify({
    name: 'EpisodeSearch',
    episodeIds,
  });
  await invoke('add_sonarr_series', { url, body });
}

export async function triggerSonarrSeasonSearch(
  baseUrl: string,
  apiKey: string,
  seriesId: number,
  seasonNumber: number
): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/command?apiKey=${apiKey}`;
  const body = JSON.stringify({
    name: 'SeasonSearch',
    seriesId,
    seasonNumber,
  });
  await invoke('add_sonarr_series', { url, body });
}

export async function deleteSonarrSeries(baseUrl: string, apiKey: string, seriesId: number): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/series/${seriesId}?deleteFiles=true&apiKey=${apiKey}`;
  await invoke('delete_sonarr_series', { url });
}

export async function deleteSonarrEpisodeFile(baseUrl: string, apiKey: string, episodeFileId: number): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/episodefile/${episodeFileId}?apiKey=${apiKey}`;
  await invoke('delete_sonarr_series', { url });
}

export async function deleteSonarrQueueItem(baseUrl: string, apiKey: string, queueId: number): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/queue/${queueId}?removeFromClient=true&blocklist=false&apiKey=${apiKey}`;
  await invoke('delete_sonarr_series', { url });
}

export async function fetchSonarrQueue(baseUrl: string, apiKey: string): Promise<UnifiedQueueItem[]> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/v3/queue?includeSeries=true&includeEpisode=true&apiKey=${apiKey}`;
  const jsonStr: string = await invoke('fetch_sonarr_series', { url });
  const data = JSON.parse(jsonStr);

  const items: UnifiedQueueItem[] = [];
  if (data && Array.isArray(data.records)) {
    data.records.forEach((record: any) => {
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

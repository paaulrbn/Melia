import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Config, DownloadInfo, Episode, LookupSeries, QualityProfile, Series, UnifiedQueueItem } from '../types';
import { normalizeRootFolder } from '../utils/formatters';
import { useAdaptivePolling } from './useAdaptivePolling';
import {
  fetchSonarrSeries,
  fetchSonarrSeriesDetail,
  fetchSonarrEpisodes,
  fetchSonarrEpisodeFiles,
  fetchSonarrQualityProfiles,
  fetchSonarrRootFolders,
  addSonarrSeries,
  triggerSonarrEpisodeSearch,
  triggerSonarrSeasonSearch,
  deleteSonarrSeries,
  deleteSonarrEpisodeFile,
  deleteSonarrQueueItem,
  fetchSonarrQueue,
} from '../services/sonarr';

interface UseSeriesProps {
  config: Config;
  downloads: Record<string, DownloadInfo>;
}

function stripTrailingSlashes(path: string): string {
  let trimmed = path.trim().toLowerCase();
  while (trimmed.endsWith('/') || trimmed.endsWith('\\')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

async function resolveSonarrRootFolder(
  sonarrUrl: string,
  sonarrKey: string,
  configuredRoot: string
): Promise<string> {
  let cleanRoot = normalizeRootFolder(configuredRoot, '/tv');

  try {
    const rootFolders = await fetchSonarrRootFolders(sonarrUrl, sonarrKey);
    if (rootFolders && rootFolders.length > 0) {
      const matched = rootFolders.find(rf => {
        const rfPath = stripTrailingSlashes(rf.path);
        const candidate = cleanRoot.toLowerCase();
        return rfPath === candidate || rfPath.endsWith(candidate) || candidate.endsWith(rfPath);
      });
      if (matched) {
        cleanRoot = matched.path;
      } else if (!cleanRoot || cleanRoot === '/tv') {
        cleanRoot = rootFolders[0].path;
      }
    }
  } catch {
    // Sonarr root folders query failed; fallback to cleanRoot
  }

  return cleanRoot || '/tv';
}

function parseSonarrErrorMessage(error: unknown): string {
  let msg = "Erreur lors de l'ajout de la série";
  if (typeof error === 'object' && error && 'message' in error) {
    msg = String((error as { message: unknown }).message);
  } else if (typeof error === 'string') {
    msg = error;
  }

  const startIdx = msg.indexOf('[');
  const endIdx = msg.lastIndexOf(']');
  if (startIdx !== -1 && endIdx > startIdx) {
    try {
      const jsonStr = msg.slice(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed[0]?.errorMessage) {
        return parsed.map((p: any) => p.errorMessage).join(', ');
      }
    } catch {
      // Ignored: fallback to original message if JSON parsing fails
    }
  }

  return msg;
}

export function useSeries({ config, downloads }: UseSeriesProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  // Lazy-loaded episodes cache: seriesId -> Episode[]
  const [episodesCache, setEpisodesCache] = useState<Record<number, Episode[]>>({});
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  // Sonarr real-time queue
  const [sonarrQueue, setSonarrQueue] = useState<UnifiedQueueItem[]>([]);
  const prevQueueKeysRef = useRef<Set<string>>(new Set());

  // Add series state
  const [addingSeries, setAddingSeries] = useState<LookupSeries | null>(null);
  const [qualityProfiles, setQualityProfiles] = useState<QualityProfile[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);
  const [isAddingSeries, setIsAddingSeries] = useState(false);
  const [addSeriesError, setAddSeriesError] = useState<string | null>(null);

  const sonarrUrl = config['SONARR_BASE_URL'];
  const sonarrKey = config['SONARR_API_KEY'];

  // Fetch all series (lightweight list with statistics)
  const loadSeries = useCallback(async (cfg?: Config) => {
    const baseUrl = cfg?.['SONARR_BASE_URL'] || sonarrUrl;
    const apiKey = cfg?.['SONARR_API_KEY'] || sonarrKey;
    if (!baseUrl || !apiKey) return;

    try {
      const data = await fetchSonarrSeries(baseUrl, apiKey);
      setSeries(data);
    } catch {
      // Failed to load series; ignore
    }
  }, [sonarrUrl, sonarrKey]);

  // Load episodes for a specific series with cache
  const loadSeriesEpisodes = useCallback(async (seriesId: number, forceRefresh = false): Promise<Episode[]> => {
    if (!forceRefresh && episodesCache[seriesId]) {
      return episodesCache[seriesId];
    }

    if (!sonarrUrl || !sonarrKey) return [];

    setIsLoadingEpisodes(true);
    try {
      const [episodes, files] = await Promise.all([
        fetchSonarrEpisodes(sonarrUrl, sonarrKey, seriesId),
        fetchSonarrEpisodeFiles(sonarrUrl, sonarrKey, seriesId),
      ]);

      const filesMap = new Map(files.map(f => [f.id, f]));
      const enrichedEpisodes = episodes.map(ep => ({
        ...ep,
        episodeFile: ep.episodeFileId ? filesMap.get(ep.episodeFileId) : undefined,
      }));

      setEpisodesCache(prev => ({ ...prev, [seriesId]: enrichedEpisodes }));
      return enrichedEpisodes;
    } catch {
      // Failed to load episodes from Sonarr; return empty array
      return [];
    } finally {
      setIsLoadingEpisodes(false);
    }
  }, [sonarrUrl, sonarrKey, episodesCache]);

  // Select a series (triggers lazy episode loading)
  const selectSeries = useCallback(async (s: Series | null) => {
    setSelectedSeries(s);
    if (s) {
      await loadSeriesEpisodes(s.id);
      // Also, refresh series detail in background to update stats
      if (sonarrUrl && sonarrKey) {
        try {
          const updated = await fetchSonarrSeriesDetail(sonarrUrl, sonarrKey, s.id);
          setSelectedSeries(prev => (prev?.id === s.id ? updated : prev));
          setSeries(prev => prev.map(item => (item.id === s.id ? updated : item)));
        } catch {
          // Failed to refresh series detail; ignore
        }
      }
    }
  }, [loadSeriesEpisodes, sonarrUrl, sonarrKey]);

  // Refresh episodes for currently selected series
  const refreshCurrentEpisodes = useCallback(async () => {
    if (selectedSeries) {
      await loadSeriesEpisodes(selectedSeries.id, true);
    }
  }, [selectedSeries, loadSeriesEpisodes]);

  // Polling queue from Sonarr
  const pollQueue = useCallback(async (): Promise<boolean> => {
    if (!sonarrUrl || !sonarrKey) return false;

    try {
      const queueList = await fetchSonarrQueue(sonarrUrl, sonarrKey);
      setSonarrQueue(queueList);

      const currentKeys = new Set(queueList.map(item => item.id));
      const prevKeys = prevQueueKeysRef.current;
      const downloadFinished = Array.from(prevKeys).some(k => !currentKeys.has(k));

      if (downloadFinished && prevKeys.size > 0) {
        await loadSeries();
        if (selectedSeries) {
          await loadSeriesEpisodes(selectedSeries.id, true);
        }
      }
      prevQueueKeysRef.current = currentKeys;
      return queueList.length > 0;
    } catch {
      // Failed to poll Sonarr queue; return false
      return false;
    }
  }, [sonarrUrl, sonarrKey, loadSeries, selectedSeries, loadSeriesEpisodes]);

  // Initial load and config change
  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  // Adaptive Sonarr queue polling
  useAdaptivePolling(pollQueue, !!(sonarrUrl && sonarrKey));

  // Library refresh on window focus / visibility and relaxed periodic check (5 min)
  useEffect(() => {
    if (!sonarrUrl || !sonarrKey) return;

    const onFocus = () => {
      void loadSeries();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadSeries();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadSeries();
      }
    }, 300000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [sonarrUrl, sonarrKey, loadSeries]);

  // Add series handler
  const openAddSeries = useCallback(async (lookupSeries: LookupSeries) => {
    setAddingSeries(lookupSeries);
    setAddSeriesError(null);
    setSelectedQuality(null);

    if (sonarrUrl && sonarrKey) {
      try {
        const profiles = await fetchSonarrQualityProfiles(sonarrUrl, sonarrKey);
        setQualityProfiles(profiles);
        if (profiles.length > 0) {
          setSelectedQuality(profiles[0].id);
        }
      } catch {
        // Failed to load quality profiles; reset list
        setQualityProfiles([]);
      }
    }
  }, [sonarrUrl, sonarrKey]);

  const closeAddSeries = useCallback(() => {
    setAddingSeries(null);
    setAddSeriesError(null);
  }, []);

  const handleAddSeries = useCallback(async () => {
    if (!addingSeries || !sonarrUrl || !sonarrKey) return false;

    setIsAddingSeries(true);
    setAddSeriesError(null);

    try {
      const cleanRoot = await resolveSonarrRootFolder(
        sonarrUrl,
        sonarrKey,
        config['SONARR_ROOT_FOLDER']
      );

      await addSonarrSeries({
        baseUrl: sonarrUrl,
        apiKey: sonarrKey,
        rootFolder: cleanRoot,
        tvdbId: addingSeries.tvdbId,
        title: addingSeries.title,
        year: addingSeries.year,
        qualityProfileId: selectedQuality || (qualityProfiles[0]?.id ?? 1),
        seasons: (addingSeries.seasons || []).map(s => ({
          seasonNumber: s.seasonNumber,
          monitored: false,
        })),
      });

      await loadSeries();
      closeAddSeries();
      return true;
    } catch (e: unknown) {
      const msg = parseSonarrErrorMessage(e);
      setAddSeriesError(msg);
      return false;
    } finally {
      setIsAddingSeries(false);
    }
  }, [addingSeries, sonarrUrl, sonarrKey, config, selectedQuality, qualityProfiles, loadSeries, closeAddSeries]);

  const handleDeleteSeries = useCallback(async (seriesId: number) => {
    if (!sonarrUrl || !sonarrKey) return;
    try {
      await deleteSonarrSeries(sonarrUrl, sonarrKey, seriesId);
      setSeries(prev => prev.filter(s => s.id !== seriesId));
      setSelectedSeries(null);
      setEpisodesCache(prev => {
        const next = { ...prev };
        delete next[seriesId];
        return next;
      });
    } catch {
      // ignore
    }
  }, [sonarrUrl, sonarrKey]);

  const handleDeleteEpisodeFile = useCallback(async (seriesId: number, episodeFileId: number) => {
    if (!sonarrUrl || !sonarrKey) return;
    try {
      await deleteSonarrEpisodeFile(sonarrUrl, sonarrKey, episodeFileId);
      await loadSeriesEpisodes(seriesId, true);
      const updated = await fetchSonarrSeriesDetail(sonarrUrl, sonarrKey, seriesId);
      setSelectedSeries(prev => (prev?.id === seriesId ? updated : prev));
      setSeries(prev => prev.map(item => (item.id === seriesId ? updated : item)));
    } catch {
      // ignore
    }
  }, [sonarrUrl, sonarrKey, loadSeriesEpisodes]);

  const handleCancelQueueItem = useCallback(async (queueId: number) => {
    if (!sonarrUrl || !sonarrKey) return;
    try {
      await deleteSonarrQueueItem(sonarrUrl, sonarrKey, queueId);
      await pollQueue();
    } catch {
      // ignore
    }
  }, [sonarrUrl, sonarrKey, pollQueue]);

  const findInLibrary = useCallback((tvdbId: number) => {
    return series.find(s => s.tvdbId === tvdbId);
  }, [series]);

  // Series downloaded locally (at least 1 episode downloaded on disk)
  const localSeriesIds = useMemo(() => {
    const ids = new Set<number>();
    Object.values(downloads).forEach(dl => {
      if (dl.mediaType === 'episode' && dl.seriesId && dl.status === 'completed') {
        ids.add(dl.seriesId);
      }
    });
    return ids;
  }, [downloads]);

  const localSeries = useMemo(() => {
    return series.filter(s => localSeriesIds.has(s.id));
  }, [series, localSeriesIds]);

  // Series on server with files available
  const serverSeries = useMemo(() => {
    return series.filter(s => {
      const epFileCount = s.statistics?.episodeFileCount ?? 0;
      return epFileCount > 0;
    });
  }, [series]);

  // Series with 0 files on server yet
  const unavailableSeries = useMemo(() => {
    return series.filter(s => {
      const epFileCount = s.statistics?.episodeFileCount ?? 0;
      return epFileCount === 0;
    });
  }, [series]);

  const selectedSeriesEpisodes = useMemo(() => {
    if (!selectedSeries) return [];
    return episodesCache[selectedSeries.id] || [];
  }, [selectedSeries, episodesCache]);

  const handleSearchEpisode = useCallback(
    async (episodeId: number) => {
      if (!sonarrUrl || !sonarrKey) return;
      try {
        await triggerSonarrEpisodeSearch(sonarrUrl, sonarrKey, [episodeId]);
        setTimeout(() => {
          pollQueue();
        }, 1500);
      } catch {
        // ignore
      }
    },
    [sonarrUrl, sonarrKey, pollQueue]
  );

  const handleSearchSeason = useCallback(
    async (seriesId: number, seasonNumber: number) => {
      if (!sonarrUrl || !sonarrKey) return;
      try {
        await triggerSonarrSeasonSearch(sonarrUrl, sonarrKey, seriesId, seasonNumber);
        setTimeout(() => {
          pollQueue();
        }, 1500);
      } catch {
        // ignore
      }
    },
    [sonarrUrl, sonarrKey, pollQueue]
  );

  return {
    series,
    localSeries,
    serverSeries,
    unavailableSeries,
    selectedSeries,
    selectedSeriesEpisodes,
    episodesCache,
    isLoadingEpisodes,
    sonarrQueue,
    addingSeries,
    qualityProfiles,
    selectedQuality,
    isAddingSeries,
    addSeriesError,
    setSelectedQuality,
    selectSeries,
    openAddSeries,
    closeAddSeries,
    handleAddSeries,
    handleDeleteSeries,
    handleDeleteEpisodeFile,
    handleCancelQueueItem,
    handleSearchEpisode,
    handleSearchSeason,
    refreshCurrentEpisodes,
    findInLibrary,
    loadSeries,
    loadSeriesEpisodes,
  };
}

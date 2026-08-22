import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import "./App.css";

interface Config {
  [key: string]: string;
}

interface Movie {
  id: number;
  title: string;
  year: number;
  overview: string;
  images: { coverType: string; remoteUrl: string }[];
  hasFile: boolean;
  movieFile?: {
    path: string;
    size: number;
  };
}

interface DownloadInfo {
  id: number;
  title: string;
  progress: number;
  sizeStr?: string;
  speed?: string;
  stats: string;
  status: 'downloading' | 'completed' | 'error' | 'paused';
  path?: string;
}

interface ProgressPayload {
  id: number;
  downloaded: number;
  total: number;
  speed?: number;
}

interface AppInfo {
  version: string;
  default_download_dir: string;
  os: string;
  arch: string;
}

interface UpdateCheckResult {
  available: boolean;
  current_version: string;
  latest_version?: string | null;
  error?: string | null;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Ko';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1);
  const value = bytesPerSec / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

function App() {
  const [config, setConfig] = useState<Config>({});
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [activeTab, setActiveTab] = useState<'movies' | 'downloads' | 'settings'>('movies');
  const [downloads, setDownloads] = useState<Record<number, DownloadInfo>>(() => {
    try {
      const saved = localStorage.getItem("melia_downloads");
      if (saved) {
        const parsed: Record<number, DownloadInfo> = JSON.parse(saved);
        const sanitized: Record<number, DownloadInfo> = {};
        for (const [key, item] of Object.entries(parsed)) {
          sanitized[Number(key)] = {
            ...item,
            status: item.status === 'downloading' ? 'paused' : item.status,
            stats: item.status === 'downloading' ? 'En pause' : item.stats,
          };
        }
        return sanitized;
      }
    } catch (e) {
      console.error("Erreur lecture downloads localStorage:", e);
    }
    return {};
  });
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [downloadDir, setDownloadDir] = useState<string>(() => {
    return localStorage.getItem("melia_download_dir") || "";
  });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  const [showConfigPrompt, setShowConfigPrompt] = useState(false);
  const [configPayload, setConfigPayload] = useState<string | null>(null);
  const [configPassword, setConfigPassword] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const handleDeepLink = (urls: string[]) => {
    for (const urlStr of urls) {
      if (urlStr.startsWith('melia://config')) {
        try {
          const parts = urlStr.split('?data=');
          if (parts.length > 1) {
            let payloadStr = decodeURIComponent(parts[1]);
            // Supprimer tout slash ou espace ajouté à la fin par Windows/Navigateurs
            payloadStr = payloadStr.replace(/[\/\s]+$/, '');
            setConfigPayload(payloadStr);
            setShowConfigPrompt(true);
            setConfigError(null);
            setConfigPassword("");
          }
        } catch (e) {
          console.error("URL invalide", e);
        }
      }
    }
  };

  const handleDecrypt = async () => {
    if (!configPayload || !configPassword) return;
    try {
      const [saltB64, ivB64, authTagB64, encryptedB64] = configPayload.split(':');
      
      const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
      const authTag = Uint8Array.from(atob(authTagB64), c => c.charCodeAt(0));
      const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));

      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(configPassword), {name: "PBKDF2"}, false, ["deriveKey"]);
      
      const key = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      const ciphertext = new Uint8Array(encrypted.length + authTag.length);
      ciphertext.set(encrypted);
      ciphertext.set(authTag, encrypted.length);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );

      const dec = new TextDecoder();
      const decryptedString = dec.decode(decryptedBuffer);
      const parsedConfig = JSON.parse(decryptedString);

      localStorage.setItem("melia_config", JSON.stringify(parsedConfig));
      setConfig(parsedConfig);
      
      if (parsedConfig["RADARR_BASE_URL"] && parsedConfig["RADARR_API_KEY"]) {
        fetchMovies(parsedConfig["RADARR_BASE_URL"], parsedConfig["RADARR_API_KEY"]);
      }
      
      setShowConfigPrompt(false);
      setConfigPayload(null);
    } catch (e: any) {
      console.error(e);
      setConfigError(`Erreur: ${e.message || 'Mot de passe incorrect ou données corrompues.'}`);
    }
  };

  useEffect(() => {
    if (selectedMovie) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [selectedMovie]);

  // Sauvegarder l'état des téléchargements dans le localStorage à chaque modification
  useEffect(() => {
    try {
      localStorage.setItem("melia_downloads", JSON.stringify(downloads));
    } catch (e) {
      console.error("Erreur sauvegarde downloads localStorage:", e);
    }
  }, [downloads]);

  useEffect(() => {
    loadConfigAndData();
    loadAppInfo();

    getCurrent().then(urls => {
      if (urls && urls.length > 0) {
        handleDeepLink(urls);
      }
    }).catch(console.error);

    let unlistenDeepLink: (() => void) | undefined;
    onOpenUrl((urls) => {
      handleDeepLink(urls);
    }).then(unlisten => {
      unlistenDeepLink = unlisten;
    }).catch(console.error);

    const updateTimer = setTimeout(async () => {
      try {
        const res: UpdateCheckResult = await invoke("check_update");
        if (res.available && res.latest_version) {
          setUpdateVersion(res.latest_version);
        }
      } catch (e) {
        console.log("Pas de mise à jour disponible ou hors ligne");
      }
    }, 3000);

    const unlisten = listen<ProgressPayload>("download_progress", (event) => {
      const payload = event.payload;
      if (payload.total) {
        const percent = Math.round((payload.downloaded / payload.total) * 100);
        const speedStr = payload.speed ? formatSpeed(payload.speed) : '';
        const sizeStr = `${formatSize(payload.downloaded)} / ${formatSize(payload.total)}`;
        const stats = speedStr ? `${sizeStr}   •   ${speedStr}` : sizeStr;

        setDownloads(prev => ({
          ...prev,
          [payload.id]: {
            ...prev[payload.id],
            progress: percent,
            sizeStr,
            speed: speedStr,
            stats,
            status: percent >= 100 ? 'completed' : 'downloading'
          }
        }));
      }
    });

    return () => {
      clearTimeout(updateTimer);
      unlisten.then(f => f());
      if (unlistenDeepLink) unlistenDeepLink();
    };
  }, []);

  const syncDownloadsWithDisk = async (moviesList: Movie[], targetDir: string) => {
    if (!moviesList.length || !targetDir) return;
    
    const updated: Record<number, DownloadInfo> = {};
    for (const movie of moviesList) {
      if (!movie.movieFile) continue;
      const ext = movie.movieFile.path.split('.').pop() || 'mkv';
      const filename = `${movie.title} (${movie.year}).${ext}`;
      const safeFilename = filename.replace(/\//g, '_').replace(/\\/g, '_');
      const separator = targetDir.endsWith('/') || targetDir.endsWith('\\') ? '' : '/';
      const filePath = `${targetDir}${separator}${safeFilename}`;

      try {
        const exists: boolean = await invoke("check_file_exists", { path: filePath });
        if (exists) {
          const sizeOnDisk: number | null = await invoke("get_file_size", { path: filePath });
          const expectedSize = movie.movieFile.size;
          
          if (sizeOnDisk !== null && sizeOnDisk > 0) {
            const isComplete = expectedSize > 0 ? sizeOnDisk >= expectedSize * 0.99 : true;
            const progress = expectedSize > 0 ? Math.min(100, Math.round((sizeOnDisk / expectedSize) * 100)) : 100;
            const stats = `${formatSize(sizeOnDisk)} / ${formatSize(expectedSize || sizeOnDisk)}`;
            
            updated[movie.id] = {
              id: movie.id,
              title: movie.title,
              progress: isComplete ? 100 : progress,
              stats: isComplete ? formatSize(sizeOnDisk) : stats,
              status: isComplete ? 'completed' : 'paused',
              path: filePath,
            };
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    if (Object.keys(updated).length > 0) {
      setDownloads(prev => ({
        ...updated,
        ...prev,
      }));
    }
  };

  const loadAppInfo = async () => {
    try {
      const info: AppInfo = await invoke("get_app_info");
      setAppInfo(info);
      const activeDir = localStorage.getItem("melia_download_dir") || info.default_download_dir;
      if (!localStorage.getItem("melia_download_dir")) {
        setDownloadDir(info.default_download_dir);
      }
      if (movies.length > 0 && activeDir) {
        syncDownloadsWithDisk(movies, activeDir);
      }
    } catch (e) {
      console.error("Erreur chargement app info:", e);
    }
  };

  const loadConfigAndData = async () => {
    try {
      let conf: Config = {};
      
      const savedConfig = localStorage.getItem("melia_config");
      if (savedConfig) {
        try {
          conf = JSON.parse(savedConfig);
        } catch (e) {}
      }
      
      if (Object.keys(conf).length === 0) {
        conf = await invoke("get_config");
      }
      
      setConfig(conf);
      
      if (conf["RADARR_BASE_URL"] && conf["RADARR_API_KEY"]) {
        fetchMovies(conf["RADARR_BASE_URL"], conf["RADARR_API_KEY"]);
      }
    } catch (e) {
      console.error("Erreur chargement config:", e);
    }
  };

  const fetchMovies = async (baseUrl: string, apiKey: string) => {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/v3/movie?apiKey=${apiKey}`;
      const jsonStr: string = await invoke("fetch_radarr_movies", { url });
      const data: Movie[] = JSON.parse(jsonStr);
      const validMovies = data.filter(m => m.hasFile && m.movieFile).reverse();
      setMovies(validMovies);

      const targetDir = downloadDir || localStorage.getItem("melia_download_dir");
      if (targetDir) {
        syncDownloadsWithDisk(validMovies, targetDir);
      }
    } catch (e) {
      console.error("Erreur chargement Radarr:", e);
    }
  };

  const getImageUrl = (movie: Movie, type: string) => {
    const img = movie.images.find(i => i.coverType === type);
    if (!img) return "";
    let url = img.remoteUrl;
    if (type === "poster" && url.includes("poster.jpg")) {
      url = url.replace("poster.jpg", "poster-250.jpg");
    }
    return url;
  };

  const getStreamUrl = (filePath: string) => {
    const host = config["MEDIA_SERVER_HOST"]?.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    const user = config["MEDIA_SERVER_USERNAME"];
    const pass = config["MEDIA_SERVER_PASSWORD"];
    const rootPath = config["MEDIA_SERVER_ROOT_PATH"] || "/paul";
    
    let cleanPath = filePath;
    const dlIndex = cleanPath.indexOf('/downloads/');
    if (dlIndex !== -1) {
      cleanPath = rootPath.replace(/\/$/, '') + cleanPath.substring(dlIndex);
    }
    
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
    
    if (user && pass) {
      return `https://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${cleanPath}`;
    }
    return `https://${host}/${cleanPath}`;
  };

  const handleDownload = async (movie: Movie) => {
    if (!movie.movieFile || downloads[movie.id]?.status === 'downloading') return;
    
    const url = getStreamUrl(movie.movieFile.path);
    const ext = movie.movieFile.path.split('.').pop() || 'mkv';
    const filename = `${movie.title} (${movie.year}).${ext}`;
    
    setDownloads(prev => ({
      ...prev,
      [movie.id]: { 
        id: movie.id, 
        title: movie.title, 
        progress: prev[movie.id]?.progress || 0, 
        stats: "Démarrage...", 
        status: 'downloading',
        speed: undefined
      }
    }));

    try {
      const customDir = downloadDir ? downloadDir : undefined;
      const savedPath = await invoke<string>("download_video", { 
        url, 
        filename, 
        id: movie.id,
        customDir 
      });
      setDownloads(prev => ({
        ...prev,
        [movie.id]: { ...prev[movie.id], status: 'completed', path: savedPath, progress: 100, speed: undefined }
      }));
    } catch (e: any) {
      console.error(e);
      const isPaused = e.toString().includes("pause");
      setDownloads(prev => ({
        ...prev,
        [movie.id]: { 
          ...prev[movie.id], 
          status: isPaused ? 'paused' : 'error', 
          stats: isPaused ? 'En pause' : 'Erreur',
          speed: undefined 
        }
      }));
    }
  };

  const handleCancelDownload = async (id: number) => {
    try {
      await invoke("cancel_download", { id });
      setDownloads(prev => {
        if (!prev[id]) return prev;
        return {
          ...prev,
          [id]: {
            ...prev[id],
            status: 'paused',
            speed: undefined,
          }
        };
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteDownload = async (id: number, deleteFromDisk: boolean = false) => {
    const dl = downloads[id];
    if (dl?.status === 'downloading') {
      await handleCancelDownload(id);
    }
    if (deleteFromDisk && dl?.path) {
      try {
        await invoke("delete_file", { path: dl.path });
      } catch (e) {
        console.error("Erreur suppression fichier:", e);
      }
    }
    setDownloads(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handlePlayLocal = async (path: string) => {
    try {
      await invoke("play_video", { url: path });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected: string | null = await invoke("select_folder");
      if (selected) {
        setDownloadDir(selected);
        localStorage.setItem("melia_download_dir", selected);
      }
    } catch (e) {
      console.error("Erreur sélection dossier:", e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const path = downloadDir || appInfo?.default_download_dir || "";
      if (path) {
        await invoke("open_folder", { path });
      }
    } catch (e) {
      console.error("Erreur ouverture dossier:", e);
    }
  };

  const handleResetFolder = () => {
    if (appInfo?.default_download_dir) {
      setDownloadDir(appInfo.default_download_dir);
      localStorage.removeItem("melia_download_dir");
    }
  };

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatusText(null);
    try {
      const res: UpdateCheckResult = await invoke("check_update");
      if (res.available && res.latest_version) {
        setUpdateVersion(res.latest_version);
        setUpdateStatusText(`Mise à jour v${res.latest_version} disponible !`);
      } else if (res.error) {
        setUpdateStatusText(`Erreur : ${res.error}`);
      } else {
        setUpdateStatusText(`Vous utilisez la dernière version (v${res.current_version})`);
      }
    } catch (e: any) {
      setUpdateStatusText(`Erreur : ${e?.message || e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const activeCount = Object.values(downloads).filter(d => d.status === 'downloading').length;

  const handleInstallUpdate = async () => {
    setIsInstalling(true);
    try {
      await invoke("install_update");
    } catch (e) {
      console.error("Erreur mise à jour:", e);
      setIsInstalling(false);
    }
  };

  return (
    <div className="melia-app">
      <header className="melia-header" data-tauri-drag-region="true" onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        e.preventDefault();
        getCurrentWindow().startDragging();
      }}>
        <h1 style={{ pointerEvents: 'none' }}>Melia</h1>
        
        <div className="header-tabs">
          <button className={`tab-btn ${activeTab === 'movies' ? 'active' : ''}`} onClick={() => setActiveTab('movies')}>
            Films
          </button>
          <button className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`} onClick={() => setActiveTab('downloads')}>
            Téléchargements {activeCount > 0 && <span className="badge">{activeCount}</span>}
          </button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            Paramètres
          </button>
        </div>

      </header>

      <main className="melia-content">
        <div style={{ display: activeTab === 'movies' ? 'block' : 'none' }}>
          <h2>Films</h2>
          {movies.length === 0 ? (
            <div className="loading-state">
              <p>Chargement de la bibliothèque ou Radarr non configuré...</p>
            </div>
          ) : (
            <div className="movie-grid">
              {movies.map(movie => {
                const dl = downloads[movie.id];
                return (
                  <div key={movie.id} className="movie-card" onClick={() => setSelectedMovie(movie)}>
                    <img src={getImageUrl(movie, "poster")} alt={movie.title} loading="lazy" />
                    <div className="movie-overlay">
                      <h3>{movie.title}</h3>
                      <span className="year">{movie.year}</span>
                      {dl && (dl.status === 'downloading' || dl.status === 'paused') && (
                        <div className="mini-progress-bar">
                          <div className={`fill ${dl.status === 'paused' ? 'paused' : ''}`} style={{width: `${dl.progress}%`}}></div>
                        </div>
                      )}
                      {dl && dl.status === 'completed' && <div className="mini-status">▶ Téléchargé</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: activeTab === 'downloads' ? 'block' : 'none' }} className="downloads-view">
          <h2>Gestionnaire de téléchargements</h2>
          {Object.values(downloads).length === 0 ? (
            <p className="loading-state">Aucun téléchargement.</p>
          ) : (
            <div className="downloads-list">
              {Object.values(downloads)
                .sort((a, b) => {
                  if (a.status === 'completed' && b.status !== 'completed') return 1;
                  if (a.status !== 'completed' && b.status === 'completed') return -1;
                  return 0;
                })
                .map(dl => (
                <div key={dl.id} className="download-item">
                  <div className="dl-info">
                    <h4>{dl.title}</h4>
                    {dl.status !== 'completed' && (
                      <span className="dl-stats">
                        <span>{dl.sizeStr || dl.stats}</span>
                        {dl.status === 'downloading' && dl.speed && <span className="dl-separator">•</span>}
                        {dl.status === 'downloading' && dl.speed && <span>{dl.speed}</span>}
                      </span>
                    )}
                  </div>
                  <div className="dl-center">
                    {dl.status !== 'completed' && (
                      <div className="progress-container">
                        <div className={`progress-bar ${dl.status === 'paused' ? 'paused' : ''}`} style={{ width: `${dl.progress}%` }}></div>
                      </div>
                    )}
                  </div>
                  <div className="dl-actions">
                    {dl.status === 'downloading' && (
                      <button className="btn-cancel-small btn-icon" onClick={() => handleCancelDownload(dl.id)} title="Pause">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                      </button>
                    )}
                    {dl.status === 'paused' && (
                      <button className="btn-resume-small btn-icon" onClick={() => {
                        const m = movies.find(movie => movie.id === dl.id);
                        if (m) handleDownload(m);
                      }} title="Reprendre">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </button>
                    )}
                    {dl.status === 'completed' && dl.path && (
                      <button className="btn-play-small" onClick={() => handlePlayLocal(dl.path!)}>▶ Lancer</button>
                    )}
                    <button
                      className="btn-cancel-small btn-icon"
                      onClick={() => handleDeleteDownload(dl.id, dl.status === 'completed')}
                      title={dl.status === 'completed' ? "Supprimer" : "Annuler"}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }} className="settings-view">
          <h2>Paramètres</h2>

          <div className="settings-list">
            <div className="settings-item">
              <div className="settings-item-info">
                <h4>Dossier de téléchargement</h4>
                <span className="settings-value" title={downloadDir || appInfo?.default_download_dir || ''}>
                  {downloadDir || appInfo?.default_download_dir || 'Chargement…'}
                </span>
              </div>
              <div className="settings-item-actions">
                <button className="btn-small" onClick={handleSelectFolder}>
                  Changer
                </button>
                <button className="btn-small" onClick={handleOpenFolder}>
                  Ouvrir
                </button>
                {downloadDir && appInfo && downloadDir !== appInfo.default_download_dir && (
                  <button className="btn-small btn-ghost" onClick={handleResetFolder}>
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <h4>Version</h4>
                <span className="settings-value">
                  v{appInfo?.version || '0.1.0'} {updateVersion ? `(v${updateVersion} disponible)` : ''}
                </span>
                {updateStatusText && (
                  <span className="settings-status-text">{updateStatusText}</span>
                )}
              </div>
              <div className="settings-item-actions">
                <button
                  className="btn-small"
                  onClick={handleManualCheckUpdate}
                  disabled={checkingUpdate || isInstalling}
                >
                  {checkingUpdate ? 'Vérification…' : 'Vérifier les mises à jour'}
                </button>
                {updateVersion && (
                  <button
                    className="btn-play-small"
                    onClick={handleInstallUpdate}
                    disabled={isInstalling}
                  >
                    {isInstalling ? 'Installation…' : 'Mettre à jour'}
                  </button>
                )}
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <h4>Radarr</h4>
                <span className="settings-value">
                  {config["RADARR_BASE_URL"] || 'Non configuré'} ({movies.length} {movies.length > 1 ? 'films' : 'film'})
                </span>
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <h4>Serveur média</h4>
                <span className="settings-value">
                  {config["MEDIA_SERVER_HOST"] || 'Non configuré'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {updateVersion && (
        <div className="update-island">
          <span className="update-dot" />
          <span className="update-text">v{updateVersion} disponible</span>
          <button className="update-cta" onClick={handleInstallUpdate} disabled={isInstalling}>
            {isInstalling ? 'Installation…' : 'Installer'}
          </button>
          <button className="update-dismiss" onClick={() => setUpdateVersion(null)}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {selectedMovie && (
        <div className="modal-backdrop" onClick={() => setSelectedMovie(null)}>
          <button className="close-btn" onClick={() => setSelectedMovie(null)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            
            <div className="modal-header" style={{ backgroundImage: `url(${getImageUrl(selectedMovie, "fanart")})` }}>
              <div className="modal-header-gradient">
                <div className="modal-title-area">
                  <h2>{selectedMovie.title} <span className="modal-year">({selectedMovie.year})</span></h2>
                </div>
              </div>
            </div>
            
            <div className="modal-body">
              <p className="overview">{selectedMovie.overview || "Aucun résumé disponible."}</p>
              {selectedMovie.movieFile && (
                <p className="file-size-info">
                  {formatSize(selectedMovie.movieFile.size)}
                </p>
              )}
              
              {(() => {
                const dl = downloads[selectedMovie.id];
                if (!dl || dl.status === 'error') {
                  return (
                    <div className="modal-actions">
                      <button className="btn-primary" onClick={() => handleDownload(selectedMovie)}>
                        ⬇ Télécharger ce film
                      </button>
                    </div>
                  );
                }
                
                if (dl.status === 'downloading' || dl.status === 'paused') {
                  return (
                    <div className="download-active-section">
                      <div className="progress-header">
                        <span>{dl.status === 'paused' ? 'Téléchargement en pause' : 'Téléchargement en cours...'} {dl.progress}%</span>
                        <span className="download-stats">
                          <span>{dl.sizeStr || dl.stats}</span>
                          {dl.status === 'downloading' && dl.speed && <span className="dl-separator">•</span>}
                          {dl.status === 'downloading' && dl.speed && <span>{dl.speed}</span>}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div className="progress-container" style={{ flex: 1, marginBottom: 0 }}>
                          <div className={`progress-bar ${dl.status === 'paused' ? 'paused' : ''}`} style={{ width: `${dl.progress}%` }}></div>
                        </div>
                        <div className="dl-actions">
                          {dl.status === 'downloading' && (
                            <button className="btn-cancel-small btn-icon" onClick={() => handleCancelDownload(selectedMovie.id)} title="Pause">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            </button>
                          )}
                          {dl.status === 'paused' && (
                            <button className="btn-resume-small btn-icon" onClick={() => handleDownload(selectedMovie)} title="Reprendre">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                if (dl.status === 'completed' && dl.path) {
                  return (
                    <div className="modal-actions">
                      <button className="btn-primary" onClick={() => handlePlayLocal(dl.path!)}>
                        ▶ Lancer le film
                      </button>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {showConfigPrompt && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ padding: '30px', maxWidth: '400px', margin: 'auto', marginTop: '100px' }}>
            <h2>Import de configuration</h2>
            <p>Veuillez entrer le mot de passe pour charger votre configuration Melia.</p>
            <input 
              type="password" 
              value={configPassword}
              onChange={e => setConfigPassword(e.target.value)}
              placeholder="Mot de passe"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', marginTop: '15px', marginBottom: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', colorScheme: 'dark', borderRadius: '8px', fontSize: '15px', outline: 'none' }}
              onKeyDown={e => { if(e.key === 'Enter') handleDecrypt(); }}
            />
            {configError && <p style={{ color: '#ff4d4f', fontSize: '0.9em', marginTop: 0, marginBottom: '15px' }}>{configError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-small btn-ghost" onClick={() => setShowConfigPrompt(false)}>Annuler</button>
              <button className="btn-small" style={{ background: 'white', color: 'black', fontWeight: 600 }} onClick={handleDecrypt}>Charger</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

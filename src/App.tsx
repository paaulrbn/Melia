import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  stats: string;
  status: 'downloading' | 'completed' | 'error' | 'paused';
  path?: string;
}

interface ProgressPayload {
  id: number;
  downloaded: number;
  total: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Ko';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function App() {
  const [config, setConfig] = useState<Config>({});
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [activeTab, setActiveTab] = useState<'movies' | 'downloads'>('movies');
  const [downloads, setDownloads] = useState<Record<number, DownloadInfo>>({});

  useEffect(() => {
    if (selectedMovie) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [selectedMovie]);

  useEffect(() => {
    loadConfigAndData();

    const unlisten = listen<ProgressPayload>("download_progress", (event) => {
      const payload = event.payload;
      if (payload.total) {
        const percent = Math.round((payload.downloaded / payload.total) * 100);
        const stats = `${formatSize(payload.downloaded)} / ${formatSize(payload.total)}`;

        setDownloads(prev => ({
          ...prev,
          [payload.id]: {
            ...prev[payload.id],
            progress: percent,
            stats,
            status: percent >= 100 ? 'completed' : 'downloading'
          }
        }));
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const loadConfigAndData = async () => {
    try {
      const conf: Config = await invoke("get_config");
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
      setMovies(data.filter(m => m.hasFile && m.movieFile).reverse());
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
        status: 'downloading' 
      }
    }));

    try {
      const savedPath = await invoke<string>("download_video", { url, filename, id: movie.id });
      setDownloads(prev => ({
        ...prev,
        [movie.id]: { ...prev[movie.id], status: 'completed', path: savedPath, progress: 100 }
      }));
    } catch (e: any) {
      console.error(e);
      const isPaused = e.toString().includes("pause");
      setDownloads(prev => ({
        ...prev,
        [movie.id]: { ...prev[movie.id], status: isPaused ? 'paused' : 'error', stats: isPaused ? 'En pause' : 'Erreur' }
      }));
    }
  };

  const handleCancelDownload = async (id: number) => {
    try {
      await invoke("cancel_download", { id });
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayLocal = async (path: string) => {
    try {
      await invoke("play_video", { url: path });
    } catch (e) {
      console.error(e);
    }
  };

  const activeCount = Object.values(downloads).filter(d => d.status === 'downloading').length;

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
                      {dl && dl.status === 'downloading' && (
                        <div className="mini-progress-bar"><div className="fill" style={{width: `${dl.progress}%`}}></div></div>
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
                    {dl.status !== 'completed' && <span className="dl-stats">{dl.stats}</span>}
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
                      <button className="btn-resume-small btn-icon" onClick={() => handleDownload(movies.find(m => m.id === dl.id)!)} title="Reprendre">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </button>
                    )}
                    {dl.status === 'completed' && dl.path && (
                      <button className="btn-play-small" onClick={() => handlePlayLocal(dl.path!)}>▶ Lancer</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

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
                        <span className="download-stats">{dl.stats}</span>
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
    </div>
  );
}

export default App;

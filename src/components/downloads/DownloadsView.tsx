import { DownloadInfo, Movie, QueueRecord } from '../../types';
import { formatSize } from '../../utils/formatters';
import { Badge, ProgressBar } from '../ui';
import { DownloadItem } from './DownloadItem';

interface DownloadsViewProps {
  downloads: Record<number, DownloadInfo>;
  radarrQueue: Record<number, QueueRecord>;
  movies: Movie[];
  onPause: (id: number) => void;
  onResume: (movie: Movie) => void;
  onPlay: (path: string) => void;
  onDelete: (id: number, deleteFromDisk: boolean) => void;
  onSelectMovie?: (movie: Movie) => void;
}

export function DownloadsView({
  downloads,
  radarrQueue,
  movies,
  onPause,
  onResume,
  onPlay,
  onDelete,
  onSelectMovie,
}: DownloadsViewProps) {
  const localDownloadList = Object.values(downloads).sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return 0;
  });

  const serverQueueList = Object.values(radarrQueue);
  const isEmpty = localDownloadList.length === 0 && serverQueueList.length === 0;

  return (
    <div className="downloads-view">
      <h2>Gestionnaire de téléchargements</h2>

      {isEmpty ? (
        <p className="loading-state">Aucun téléchargement en cours.</p>
      ) : (
        <>
          {/* Server Downloads (Radarr) */}
          {serverQueueList.length > 0 && (
            <div className="downloads-section" style={{ marginBottom: '35px' }}>
              <h3
                className="category-title"
                style={{
                  fontSize: '1.3rem',
                  marginBottom: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                Téléchargements sur le serveur
                <Badge variant="server">{serverQueueList.length}</Badge>
              </h3>
              <div className="downloads-list">
                {serverQueueList.map(queueItem => {
                  const movie = movies.find(m => m.id === queueItem.movieId);
                  const title =
                    queueItem.movie?.title || movie?.title || queueItem.title || 'Film';
                  const progress =
                    queueItem.size > 0
                      ? Math.round(
                          ((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100
                        )
                      : 0;
                  const downloaded = queueItem.size - queueItem.sizeleft;
                  const sizeStr = `${formatSize(downloaded)} / ${formatSize(queueItem.size)}`;

                  return (
                    <div
                      key={queueItem.movieId}
                      className="download-item"
                      style={{ cursor: movie ? 'pointer' : 'default' }}
                      onClick={() => movie && onSelectMovie?.(movie)}
                      title={movie ? 'Cliquer pour voir les détails' : undefined}
                    >
                      <div className="dl-info">
                        <h4 title={title}>{title}</h4>
                        <span className="dl-stats" style={{ color: 'var(--status-server)' }}>
                          <span>{sizeStr}</span>
                          {queueItem.timeleft && <span className="dl-separator">•</span>}
                          {queueItem.timeleft && (
                            <span>Temps restant : {queueItem.timeleft}</span>
                          )}
                        </span>
                      </div>

                      <div className="dl-center">
                        <ProgressBar value={progress} variant="server" size="md" />
                      </div>

                      <div className="dl-actions">
                        <span
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--status-server)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {progress}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Local Downloads (Melia) */}
          <div className="downloads-section">
            {serverQueueList.length > 0 && (
              <h3
                className="category-title"
                style={{
                  fontSize: '1.3rem',
                  marginBottom: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                Téléchargements locaux
                {localDownloadList.length > 0 && (
                  <Badge variant="accent">{localDownloadList.length}</Badge>
                )}
              </h3>
            )}

            {localDownloadList.length === 0 && serverQueueList.length > 0 ? (
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  margin: '10px 0',
                }}
              >
                Aucun téléchargement local.
              </p>
            ) : (
              <div className="downloads-list">
                {localDownloadList.map(dl => (
                  <DownloadItem
                    key={dl.id}
                    download={dl}
                    onPause={onPause}
                    onResume={id => {
                      const m = movies.find(movie => movie.id === id);
                      if (m) onResume(m);
                    }}
                    onPlay={onPlay}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

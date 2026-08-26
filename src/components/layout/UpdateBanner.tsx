import { CloseIcon } from '../common/Icons';

interface UpdateBannerProps {
  updateVersion: string | null;
  isInstalling: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  updateVersion,
  isInstalling,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  if (!updateVersion) return null;

  return (
    <div className="update-island">
      <span className="update-dot" />
      <span className="update-text">v{updateVersion} disponible</span>
      <button className="update-cta" onClick={onInstall} disabled={isInstalling}>
        {isInstalling ? 'Installation…' : 'Installer'}
      </button>
      <button className="update-dismiss" onClick={onDismiss} aria-label="Ignorer la mise à jour">
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

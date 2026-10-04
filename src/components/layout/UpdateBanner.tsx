import { X } from 'lucide-react';
import { IconButton } from '../ui';

interface UpdateBannerProps {
  readonly updateVersion: string | null;
  readonly isInstalling: boolean;
  readonly onInstall: () => void;
  readonly onDismiss: () => void;
}

export function UpdateBanner({
  updateVersion,
  isInstalling,
  onInstall,
  onDismiss,
}: Readonly<UpdateBannerProps>) {
  if (!updateVersion) return null;

  return (
    <div className="update-island">
      <span className="update-dot" />
      <span className="update-text">v{updateVersion} disponible</span>
      <button className="update-cta" onClick={onInstall} disabled={isInstalling}>
        {isInstalling ? 'Installation…' : 'Installer'}
      </button>
      <IconButton
        icon={<X size={12} />}
        onClick={onDismiss}
        aria-label="Ignorer la mise à jour"
        size="sm"
        variant="ghost"
        className="update-dismiss"
      />
    </div>
  );
}

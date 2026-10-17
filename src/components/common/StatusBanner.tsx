import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button, IconButton } from '../ui';

interface StatusBannerProps {
  readonly title: string;
  readonly detail?: string | null;
  readonly onRetry?: () => void;
  readonly onDismiss?: () => void;
}

/** Inline error banner: unreachable server or failed action, with retry / dismiss. */
export function StatusBanner({ title, detail, onRetry, onDismiss }: Readonly<StatusBannerProps>) {
  return (
    <div className="status-banner" role="alert">
      <AlertTriangle size={18} className="status-banner-icon" />
      <div className="status-banner-body">
        <span className="status-banner-title">{title}</span>
        {detail && <span className="status-banner-detail">{detail}</span>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
      {onDismiss && (
        <IconButton
          icon={<X size={14} />}
          onClick={onDismiss}
          aria-label="Fermer le message"
          size="sm"
          variant="ghost"
        />
      )}
    </div>
  );
}

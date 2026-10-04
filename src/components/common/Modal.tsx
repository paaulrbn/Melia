import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui';

interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly backdropClassName?: string;
  readonly contentStyle?: CSSProperties;
  readonly showCloseButton?: boolean;
  readonly closeOnEscape?: boolean;
  readonly closeOnBackdropClick?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  children,
  contentClassName = 'modal-content',
  backdropClassName = '',
  contentStyle,
  showCloseButton = true,
  closeOnEscape = true,
  closeOnBackdropClick = true,
}: Readonly<ModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (closeOnEscape && e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose, closeOnEscape]);

  useEffect(() => {
    if (!isOpen || !closeOnBackdropClick) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        onClose();
      }
    };

    dialog.addEventListener('click', handleBackdropClick);
    return () => {
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, onClose, closeOnBackdropClick]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      open
      aria-modal="true"
      className={`modal-backdrop ${backdropClassName}`.trim()}
    >
      {showCloseButton && (
        <IconButton
          icon={<X size={20} />}
          onClick={onClose}
          aria-label="Fermer"
          className="close-btn"
          shape="circle"
          size="lg"
        />
      )}
      <div
        className={contentClassName}
        style={contentStyle}
      >
        {children}
      </div>
    </dialog>
  );
}

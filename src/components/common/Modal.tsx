import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
  backdropClassName?: string;
  contentStyle?: React.CSSProperties;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  children,
  contentClassName = 'modal-content',
  backdropClassName = '',
  contentStyle,
  showCloseButton = true,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`modal-backdrop ${backdropClassName}`.trim()} onClick={onClose}>
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
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

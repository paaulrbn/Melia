import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  icon?: React.ReactNode;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  icon,
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      backdropClassName="confirm-modal-backdrop"
      contentClassName="modal-content confirm-modal-content"
      showCloseButton={false}
    >
      <div className="confirm-modal-body">
        <div className={`confirm-modal-icon-wrapper confirm-modal-icon-wrapper--${variant}`}>
          {icon || (variant === 'danger' ? <Trash2 size={22} /> : <AlertTriangle size={22} />)}
        </div>
        <div className="confirm-modal-text">
          <h3 className="confirm-modal-title">{title}</h3>
          <div className="confirm-modal-message">{message}</div>
        </div>
      </div>
      <div className="confirm-modal-actions">
        <Button variant="secondary" size="md" fullWidth onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          size="md"
          fullWidth
          isLoading={isLoading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

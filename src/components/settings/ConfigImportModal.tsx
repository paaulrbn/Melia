import { Modal } from '../common/Modal';
import { Button, Input } from '../ui';

interface ConfigImportModalProps {
  readonly isOpen: boolean;
  readonly password: string;
  readonly onPasswordChange: (pwd: string) => void;
  readonly error: string | null;
  readonly onDecrypt: () => void;
  readonly onClose: () => void;
}

export function ConfigImportModal({
  isOpen,
  password,
  onPasswordChange,
  error,
  onDecrypt,
  onClose,
}: Readonly<ConfigImportModalProps>) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentStyle={{
        padding: '30px',
        maxWidth: '400px',
        margin: 'auto',
        marginTop: '100px',
      }}
      showCloseButton={false}
    >
      <h2>Import de configuration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Veuillez entrer le mot de passe pour charger votre configuration Melia.
      </p>

      <div style={{ marginBottom: '20px' }}>
        <Input
          type="password"
          inputSize="md"
          fullWidth
          value={password}
          onChange={e => onPasswordChange(e.target.value)}
          placeholder="Mot de passe"
          error={error || undefined}
          onKeyDown={e => {
            if (e.key === 'Enter') onDecrypt();
          }}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" size="sm" onClick={onDecrypt}>
          Charger
        </Button>
      </div>
    </Modal>
  );
}

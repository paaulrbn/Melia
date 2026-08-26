import { Modal } from '../common/Modal';

interface ConfigImportModalProps {
  isOpen: boolean;
  password: string;
  onPasswordChange: (pwd: string) => void;
  error: string | null;
  onDecrypt: () => void;
  onClose: () => void;
}

export function ConfigImportModal({
  isOpen,
  password,
  onPasswordChange,
  error,
  onDecrypt,
  onClose,
}: ConfigImportModalProps) {
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
      <p>Veuillez entrer le mot de passe pour charger votre configuration Melia.</p>

      <input
        type="password"
        value={password}
        onChange={e => onPasswordChange(e.target.value)}
        placeholder="Mot de passe"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          marginTop: '15px',
          marginBottom: '20px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'white',
          colorScheme: 'dark',
          borderRadius: '8px',
          fontSize: '15px',
          outline: 'none',
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') onDecrypt();
        }}
        autoFocus
      />

      {error && (
        <p style={{ color: '#ff4d4f', fontSize: '0.9em', marginTop: 0, marginBottom: '15px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button className="btn-small btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-small"
          style={{ background: 'white', color: 'black', fontWeight: 600 }}
          onClick={onDecrypt}
        >
          Charger
        </button>
      </div>
    </Modal>
  );
}

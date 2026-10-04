import { Modal } from '../common/Modal';
import { ChangelogGroup } from '../../types';
import { Button } from '../ui';
import { fireConfetti } from '../../utils/confetti';

interface ChangelogModalProps {
  readonly isOpen: boolean;
  readonly version: string;
  readonly groups: ChangelogGroup[];
  readonly onClose: () => void;
}

export function ChangelogModal({
  isOpen,
  version,
  groups,
  onClose,
}: Readonly<ChangelogModalProps>) {
  if (!isOpen) return null;

  const handleDiscover = () => {
    fireConfetti();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="changelog-modal-content"
      showCloseButton={false}
      closeOnEscape={false}
      closeOnBackdropClick={false}
    >
      <div className="changelog-header">
        <h2 className="changelog-title">Nouveautés</h2>
        <span className="changelog-version">Version v{version}</span>
      </div>

      <div className="changelog-body">
        {groups.map(group => (
          <div key={group.title} className="changelog-group">
            <h3 className="changelog-group-title">{group.title}</h3>
            <ul className="changelog-list">
              {group.items.map(item => (
                <li key={item} className="changelog-list-item">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="changelog-footer">
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleDiscover}
        >
          Découvrir
        </Button>
      </div>
    </Modal>
  );
}

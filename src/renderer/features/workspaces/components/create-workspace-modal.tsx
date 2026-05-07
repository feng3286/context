import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal, type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldLabel } from '@renderer/lib/ui/field';
import { ModalLayout } from '@renderer/lib/ui/modal-layout';
import { workspaceManagerStore } from '../stores/workspace-manager';

export interface CreateWorkspaceModalProps extends BaseModalProps<void> {}

export const CreateWorkspaceModal = observer(function CreateWorkspaceModal({
  onSuccess,
  onClose,
}: CreateWorkspaceModalProps) {
  const { navigate } = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const id = await workspaceManagerStore.createWorkspace({
        id: crypto.randomUUID(),
        name: name.trim(),
      });
      onSuccess(void 0);
      navigate('workspace', { workspaceId: id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      // Provide friendly error message for common cases
      if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
        setError('A workspace with this name already exists');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalLayout
      header={
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>
      }
      footer={
        <DialogFooter>
          <ConfirmButton
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || loading}
          >
            {loading ? 'Creating...' : 'Create'}
          </ConfirmButton>
        </DialogFooter>
      }
    >
      <DialogContentArea className="gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="My Workspace"
            autoFocus
          />
        </Field>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </DialogContentArea>
    </ModalLayout>
  );
});

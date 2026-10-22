import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import { isValidProviderId } from '@shared/agent-provider-registry';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { AgentSelector } from '@renderer/lib/components/agent-selector/agent-selector';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@renderer/lib/ui/field';

/**
 * Creates an agent chat tab for a task — one tab per agent, no terminal.
 */
export const CreateChatTabModal = observer(function CreateChatTabModal({
  excludeProviderIds,
  onCreate,
  onSuccess,
}: BaseModalProps<void> & {
  projectId: string;
  taskId: string;
  /** Agents that already have a chat tab in this task. */
  excludeProviderIds: string[];
  onCreate: (providerId: string) => void;
}) {
  const { value: defaultAgentValue } = useAppSettingsKey('defaultAgent');
  const [providerId, setProviderId] = useState<string | null>(
    isValidProviderId(defaultAgentValue) && !excludeProviderIds.includes(defaultAgentValue)
      ? defaultAgentValue
      : null
  );

  const handleCreate = useCallback(() => {
    if (!providerId) return;
    onCreate(providerId);
    onSuccess(undefined);
  }, [providerId, onCreate, onSuccess]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>New chat tab</DialogTitle>
      </DialogHeader>
      <DialogContentArea>
        <FieldGroup>
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <AgentSelector
              value={providerId}
              onChange={setProviderId}
              excludeAgentIds={excludeProviderIds}
            />
          </Field>
        </FieldGroup>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton onClick={handleCreate} disabled={!providerId}>
          Create
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});

import { Sparkles } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AGENT_PROVIDER_IDS,
  AgentProviderId,
  isValidProviderId,
} from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { useAgentAutoApproveDefaults } from '@renderer/features/tasks/hooks/useAgentAutoApproveDefaults';
import { asProvisioned, getTaskStore } from '@renderer/features/tasks/stores/task-selectors';
import { AgentSelector } from '@renderer/lib/components/agent-selector/agent-selector';
import { rpc } from '@renderer/lib/ipc';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { getPaneContainer } from '@renderer/lib/pty/pane-sizing-context';
import { measureDimensions } from '@renderer/lib/pty/pty-dimensions';
import { appState } from '@renderer/lib/stores/app-state';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@renderer/lib/ui/field';
import { Switch } from '@renderer/lib/ui/switch';
import { nextDefaultConversationTitle } from './conversation-title-utils';
import { resolveConversationProviderSelection } from './provider-selection';

function getConversationsPaneSize() {
  const container = getPaneContainer('conversations');
  return container ? (measureDimensions(container, 8, 16) ?? undefined) : undefined;
}

/** Check if a CLI command is available by running `{cli} --version` */
async function detectCli(cli: string): Promise<boolean> {
  return rpc.customAgents.checkCli(cli);
}

export const CreateConversationModal = observer(function CreateConversationModal({
  connectionId,
  onSuccess,
  projectId,
  taskId,
}: BaseModalProps<{ conversationId: string }> & {
  connectionId?: string;
  projectId: string;
  taskId: string;
}) {
  const [providerOverride, setProviderOverride] = useState<string | null>(null);
  const { value: defaultAgentValue } = useAppSettingsKey('defaultAgent');
  const { value: rawCustomAgents } = useAppSettingsKey('customAgents');
  const customAgents = Array.isArray(rawCustomAgents) ? rawCustomAgents : [];
  const defaultProviderId: string = isValidProviderId(defaultAgentValue)
    ? defaultAgentValue
    : 'claude';

  const dependencyResource = connectionId
    ? appState.dependencies.getRemote(connectionId)
    : appState.dependencies.local;
  const availabilityKnown = dependencyResource.data !== null;
  const installedProviderIds = AGENT_PROVIDER_IDS.filter(
    (id) => dependencyResource.data?.[id]?.status === 'available'
  );

  // Track connection status of custom agents
  const [customConnectedIds, setCustomConnectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const connected = new Set<string>();
      for (const entry of customAgents) {
        if (await detectCli(entry.cli)) {
          connected.add(entry.id);
        }
      }
      if (!cancelled) setCustomConnectedIds(connected);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [customAgents]);

  // Custom agents with connection status
  const connectedCustomAgents = useMemo(
    () => customAgents.filter((e) => customConnectedIds.has(e.id)),
    [customAgents, customConnectedIds]
  );

  // Resolve provider selection including custom agents
  const providerSelection = useMemo(() => {
    // First try built-in resolution
    const builtInResult = resolveConversationProviderSelection({
      defaultProviderId: isValidProviderId(defaultProviderId)
        ? (defaultProviderId as AgentProviderId)
        : 'claude',
      providerOverride: isValidProviderId(providerOverride)
        ? (providerOverride as AgentProviderId)
        : null,
      installedProviderIds,
      availabilityKnown,
    });

    if (builtInResult.providerId) return builtInResult;

    // If no built-in provider is available, try custom agents
    if (connectedCustomAgents.length > 0) {
      return {
        providerId: connectedCustomAgents[0].id,
        createDisabled: false,
      };
    }

    return builtInResult;
  }, [
    defaultProviderId,
    providerOverride,
    installedProviderIds,
    availabilityKnown,
    connectedCustomAgents,
  ]);

  const { providerId, createDisabled } = providerSelection;

  const taskStore = getTaskStore(projectId, taskId);
  const provisioned = taskStore ? asProvisioned(taskStore) : undefined;
  const conversationMgr = provisioned?.conversations;
  const autoApproveDefaults = useAgentAutoApproveDefaults();
  const skipPermissions = providerId ? autoApproveDefaults.getDefault(providerId) : false;
  const titleProviderId = providerId ?? defaultProviderId;
  const title = nextDefaultConversationTitle(
    titleProviderId,
    Array.from(conversationMgr?.conversations.values() ?? [], (conversation) => conversation.data)
  );

  const handleCreateConversation = useCallback(() => {
    if (createDisabled || !conversationMgr || !providerId) return;
    const id = crypto.randomUUID();
    conversationMgr.createConversation({
      taskId,
      id,
      autoApprove: skipPermissions,
      provider: providerId,
      title,
      initialSize: getConversationsPaneSize(),
    });
    onSuccess({ conversationId: id });
  }, [conversationMgr, createDisabled, providerId, title, onSuccess, taskId, skipPermissions]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Conversation</DialogTitle>
      </DialogHeader>
      <DialogContentArea>
        <FieldGroup>
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <AgentSelector
              value={providerId}
              onChange={setProviderOverride}
              connectionId={connectionId}
              customAgents={customAgents}
              customAgentConnectedIds={customConnectedIds}
            />
          </Field>
          <Field>
            <div className="flex items-center gap-2">
              <Switch
                checked={skipPermissions}
                disabled={!providerId || autoApproveDefaults.loading || autoApproveDefaults.saving}
                onCheckedChange={(checked) => {
                  if (providerId) autoApproveDefaults.setDefault(providerId, checked);
                }}
              />
              <FieldLabel>Dangerously skip permissions</FieldLabel>
            </div>
          </Field>
        </FieldGroup>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton onClick={handleCreateConversation} disabled={createDisabled}>
          Create
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { useToast } from '@renderer/lib/hooks/use-toast';
import { appState } from '@renderer/lib/stores/app-state';
import { agentConfig } from '@renderer/utils/agentConfig';
import { getAgentInstallErrorMessage } from './agent-install';
import {
  buildAgentGroups,
  buildCustomAgentOptions,
  getAssumedInstalledAgents,
  mergeCustomAgentsIntoGroups,
} from './agent-selector-options';

export function useAgentAvailability({
  connectionId,
  value,
  customAgents = [],
  customAgentConnectedIds = new Set<string>(),
}: {
  connectionId?: string;
  value: string | null;
  customAgents?: CustomAgentEntry[];
  customAgentConnectedIds?: Set<string>;
}) {
  const dependencyResource = connectionId
    ? appState.dependencies.getRemote(connectionId)
    : appState.dependencies.local;
  const dependencyData = dependencyResource.data;
  const { toast } = useToast();
  const { t } = useTranslation();

  const installedAgents = useMemo(
    () =>
      dependencyData
        ? Object.entries(dependencyData)
            .filter(([, state]) => state.category === 'agent' && state.status === 'available')
            .map(([id]) => id)
        : [],
    [dependencyData]
  );

  const assumedInstalledAgents = useMemo(
    () => getAssumedInstalledAgents(value, dependencyData),
    [value, dependencyData]
  );

  const customOptions = useMemo(
    () => buildCustomAgentOptions(customAgents, customAgentConnectedIds),
    [customAgents, customAgentConnectedIds]
  );

  const builtInGroups = useMemo(
    () => buildAgentGroups(installedAgents, assumedInstalledAgents, customAgentConnectedIds.size),
    [installedAgents, assumedInstalledAgents, customAgentConnectedIds.size]
  );

  const groups = useMemo(
    () => mergeCustomAgentsIntoGroups(builtInGroups, customOptions),
    [builtInGroups, customOptions]
  );

  const installingAgents = new Set<AgentProviderId>();
  for (const group of groups) {
    for (const item of group.items) {
      if (appState.dependencies.isInstalling(item.agentId as AgentProviderId, connectionId)) {
        installingAgents.add(item.agentId as AgentProviderId);
      }
    }
  }

  const installAgent = useCallback(
    async (agentId: AgentProviderId): Promise<void> => {
      if (appState.dependencies.isInstalling(agentId, connectionId)) return;
      const result = await appState.dependencies.install(agentId, connectionId);
      if (!result.success) {
        toast({
          title: t('toast:agent.installFailed'),
          description: getAgentInstallErrorMessage(result.error),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('toast:agent.installed'),
        description: t('toast:agent.installedDesc', {
          name: (agentConfig as Record<string, { name: string }>)[agentId]?.name ?? agentId,
        }),
      });
    },
    [t, toast, connectionId]
  );

  return {
    groups,
    dependencyData,
    installingAgents,
    installAgent,
  };
}

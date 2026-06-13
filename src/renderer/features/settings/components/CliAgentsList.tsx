import { Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AGENT_PROVIDERS,
  isValidProviderId,
  type AgentProviderId,
} from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import type { DependencyState } from '@shared/dependencies';
import { CliAgentStatus } from '@renderer/features/settings/components/connections';
import CustomAgentModal from '@renderer/features/settings/components/CustomAgentModal';
import CustomCommandModal from '@renderer/features/settings/components/CustomCommandModal';
import IntegrationRow from '@renderer/features/settings/components/IntegrationRow';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { getAgentInstallErrorMessage } from '@renderer/lib/components/agent-selector/agent-install';
import { AgentInstallButton } from '@renderer/lib/components/agent-selector/agent-install-button';
import { useToast } from '@renderer/lib/hooks/use-toast';
import { rpc } from '@renderer/lib/ipc';
import { agentMeta } from '@renderer/lib/providers/meta';
import { appState } from '@renderer/lib/stores/app-state';
import { Button } from '@renderer/lib/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { log } from '@renderer/utils/logger';

export const BASE_CLI_AGENTS: CliAgentStatus[] = AGENT_PROVIDERS.filter(
  (provider) => provider.detectable !== false
).map((provider) => ({
  id: provider.id,
  name: provider.name,
  status: 'missing' as const,
  docUrl: provider.docUrl ?? null,
  installCommand: provider.installCommand ?? null,
}));

function mapDependencyStatesToCli(
  agentStatuses: Record<string, DependencyState>
): CliAgentStatus[] {
  const mergedMap = new Map<string, CliAgentStatus>();
  BASE_CLI_AGENTS.forEach((agent) => {
    mergedMap.set(agent.id, { ...agent });
  });
  Object.entries(agentStatuses).forEach(([agentId, state]) => {
    const base = mergedMap.get(agentId);
    mergedMap.set(agentId, {
      ...(base ?? { id: agentId, name: agentId, docUrl: null, installCommand: null }),
      id: agentId,
      name: base?.name ?? agentId,
      status: state.status === 'available' ? 'connected' : state.status,
      version: state.version ?? null,
      command: state.path ?? null,
    });
  });
  return Array.from(mergedMap.values());
}

const ICON_BUTTON =
  'rounded-md p-1.5 text-muted-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

type AgentRowActions = {
  isInstalling: (id: AgentProviderId) => boolean;
  onInstallClick: (agent: CliAgentStatus) => void;
  onSettingsClick: (id: string) => void;
};

const renderAgentRow = (
  agent: CliAgentStatus,
  actions: AgentRowActions,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const logo = agentMeta[agent.id as keyof typeof agentMeta]?.icon;
  const providerId = isValidProviderId(agent.id) ? agent.id : null;

  const handleNameClick = agent.docUrl
    ? async () => {
        try {
          await rpc.app.openExternal(agent.docUrl!);
        } catch (openError) {
          log.error(`Failed to open ${agent.name} docs:`, openError);
        }
      }
    : undefined;

  const isDetected = agent.status === 'connected';
  const indicatorClass = isDetected ? 'bg-emerald-500' : 'bg-muted-foreground/50';
  const statusLabel = isDetected ? t('common:detected') : t('common:notDetected');

  return (
    <IntegrationRow
      key={agent.id}
      logoSrc={logo}
      icon={
        logo ? undefined : (
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        )
      }
      name={agent.name}
      onNameClick={handleNameClick}
      status={agent.status}
      statusLabel={statusLabel}
      showStatusPill={false}
      installCommand={agent.installCommand}
      middle={
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${indicatorClass}`} />
          {statusLabel}
        </span>
      }
      rightExtra={
        isDetected ? (
          <TooltipProvider delay={150}>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={() => actions.onSettingsClick(agent.id)}
                  className={ICON_BUTTON}
                  aria-label={t('common:settingsFor', { name: agent.name })}
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t('common:executionSettings')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : providerId ? (
          <AgentInstallButton
            agentId={providerId}
            canInstall={!!agent.installCommand}
            isInstalled={isDetected}
            isInstalling={actions.isInstalling(providerId)}
            tooltipSide="top"
            onInstall={() => actions.onInstallClick(agent)}
          />
        ) : null
      }
    />
  );
};

const renderCustomAgentRow = (
  entry: CustomAgentEntry,
  isConnected: boolean,
  onEdit: () => void,
  onDelete: () => void,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const indicatorClass = isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50';
  const statusLabel = isConnected ? t('common:detected') : t('common:notDetected');

  return (
    <IntegrationRow
      key={entry.id}
      icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
      name={entry.name}
      status={isConnected ? 'connected' : 'missing'}
      statusLabel={statusLabel}
      showStatusPill={false}
      middle={
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${indicatorClass}`} />
          {statusLabel}
        </span>
      }
      rightExtra={
        <div className="flex items-center gap-1">
          <TooltipProvider delay={150}>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={onEdit}
                  className={ICON_BUTTON}
                  aria-label={t('settings:customAgent.edit')}
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t('settings:customAgent.edit')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delay={150}>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-md p-1.5 text-destructive transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={t('common:delete')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t('common:delete')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      }
    />
  );
};

/** Check if a CLI command is available by running `{cli} --version` */
async function detectCli(cli: string): Promise<boolean> {
  return rpc.customAgents.checkCli(cli);
}

export const CliAgentsList: React.FC = observer(() => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const agentStatuses = appState.dependencies.agentStatuses;

  // Built-in agent modal
  const [customModalAgentId, setCustomModalAgentId] = useState<string | null>(null);

  // Custom agent modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<CustomAgentEntry | null>(null);

  const { value: rawCustomAgents, update: updateCustomAgents } = useAppSettingsKey('customAgents');
  const customAgents = Array.isArray(rawCustomAgents) ? rawCustomAgents : [];

  const sortedAgents = useMemo(() => {
    return mapDependencyStatesToCli(agentStatuses).sort((a, b) => {
      if (a.status === 'connected' && b.status !== 'connected') return -1;
      if (b.status === 'connected' && a.status !== 'connected') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [agentStatuses]);

  // Track connection status of custom agents
  const [customConnections, setCustomConnections] = useState<Record<string, boolean>>({});

  const checkCustomConnections = useCallback(async () => {
    const results: Record<string, boolean> = {};
    for (const entry of customAgents) {
      results[entry.id] = await detectCli(entry.cli);
    }
    setCustomConnections(results);
  }, [customAgents]);

  // Re-check when custom agents change
  React.useEffect(() => {
    void checkCustomConnections();
  }, [checkCustomConnections]);

  const handleInstall = useCallback(
    async (agent: CliAgentStatus) => {
      if (!isValidProviderId(agent.id) || appState.dependencies.isInstalling(agent.id)) {
        return;
      }

      const result = await appState.dependencies.install(agent.id);

      if (result.success) {
        toast({
          title: t('common:agentInstalled'),
          description: t('common:agentReady', { name: agent.name }),
        });
        return;
      }

      toast({
        title: t('common:installFailed'),
        description: getAgentInstallErrorMessage(result.error),
        variant: 'destructive',
      });
    },
    [toast]
  );

  const rowActions = useMemo<AgentRowActions>(
    () => ({
      isInstalling: (id) => appState.dependencies.isInstalling(id),
      onInstallClick: (agent) => {
        void handleInstall(agent);
      },
      onSettingsClick: setCustomModalAgentId,
    }),
    [handleInstall]
  );

  const handleSaveCustomAgent = useCallback(
    async (entry: CustomAgentEntry) => {
      const existing = customAgents.find((e) => e.id === entry.id);
      const next = existing
        ? customAgents.map((e) => (e.id === entry.id ? { ...e, ...entry } : e))
        : [...customAgents, entry];
      updateCustomAgents(next);
      void checkCustomConnections();
    },
    [customAgents, updateCustomAgents, checkCustomConnections]
  );

  const handleDeleteCustomAgent = useCallback(
    async (id: string) => {
      updateCustomAgents(customAgents.filter((e) => e.id !== id));
      void checkCustomConnections();
    },
    [customAgents, updateCustomAgents, checkCustomConnections]
  );

  const handleDeleteClick = useCallback(
    (entry: CustomAgentEntry) => {
      if (window.confirm(t('settings:customAgent.confirmDelete'))) {
        void handleDeleteCustomAgent(entry.id);
      }
    },
    [handleDeleteCustomAgent, t]
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sortedAgents.map((agent) => renderAgentRow(agent, rowActions, t))}
      </div>

      {/* Custom agents section */}
      <div className="pt-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('settings:customAgent.section')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('settings:customAgent.add')}
          </Button>
        </div>

        {customAgents.length > 0 && (
          <div className="space-y-2">
            {customAgents.map((entry) =>
              renderCustomAgentRow(
                entry,
                customConnections[entry.id] ?? false,
                () => setEditEntry(entry),
                () => handleDeleteClick(entry),
                t
              )
            )}
          </div>
        )}

        {customAgents.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('settings:customAgent.empty')}
          </p>
        )}
      </div>

      {/* Built-in agent settings modal */}
      <CustomCommandModal
        isOpen={customModalAgentId !== null}
        onClose={() => setCustomModalAgentId(null)}
        providerId={customModalAgentId ?? ''}
      />

      {/* Create custom agent modal */}
      <CustomAgentModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleSaveCustomAgent}
        existingIds={customAgents.map((e) => e.id)}
      />

      {/* Edit custom agent modal */}
      <CustomAgentModal
        isOpen={editEntry !== null}
        onClose={() => setEditEntry(null)}
        onSave={handleSaveCustomAgent}
        onDelete={handleDeleteCustomAgent}
        existing={editEntry}
        existingIds={customAgents.filter((e) => e.id !== editEntry?.id).map((e) => e.id)}
      />
    </div>
  );
});

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentProviderId, isValidProviderId } from '@shared/agent-provider-registry';
import type { AppSettings } from '@shared/app-settings';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { AgentSelector } from '@renderer/lib/components/agent-selector/agent-selector';
import { rpc } from '@renderer/lib/ipc';
import { SettingRow } from './SettingRow';

const DEFAULT_AGENT: AgentProviderId = 'claude';

/** Check if a CLI command is available by running `{cli} --version` */
async function detectCli(cli: string): Promise<boolean> {
  return rpc.customAgents.checkCli(cli);
}

const DefaultAgentSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const {
    value: defaultAgentValue,
    update,
    isLoading: loading,
    isSaving: saving,
  } = useAppSettingsKey('defaultAgent');

  const { value: rawCustomAgents } = useAppSettingsKey('customAgents');
  const customAgents = Array.isArray(rawCustomAgents) ? rawCustomAgents : [];

  // Track connection status of custom agents
  const [customConnectedIds, setCustomConnectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!customAgents.length) return;
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

  const defaultAgent: AgentProviderId = isValidProviderId(defaultAgentValue)
    ? (defaultAgentValue as AgentProviderId)
    : DEFAULT_AGENT;

  const handleChange = (agent: string) => {
    update(agent as AppSettings['defaultAgent']);
  };

  return (
    <SettingRow
      title={t('settings:agents.defaultAgent')}
      description={t('settings:agents.defaultAgentDesc')}
      control={
        <div className="w-[183px] shrink-0">
          <AgentSelector
            value={defaultAgent}
            onChange={handleChange}
            disabled={loading || saving}
            className="w-full"
            customAgents={customAgents}
            customAgentConnectedIds={customConnectedIds}
          />
        </div>
      }
    />
  );
};

export default DefaultAgentSettingsCard;

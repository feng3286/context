import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { agentConfig } from '@renderer/utils/agentConfig';
import { getAgentInstallActionState } from './agent-install';

export interface AgentOption {
  value: string;
  label: string;
  agentId: string;
  disabled: boolean;
  isCustom?: boolean;
}

export interface AgentGroup {
  value: string;
  label: string;
  items: AgentOption[];
}

export function buildAgentGroups(
  installedAgents: string[],
  assumedInstalledAgents: string[] = [],
  /** Number of connected custom agents — ensures 'Installed' group is created even when
   *  no built-in agents are detected, so connected custom agents have a group to merge into. */
  customConnectedCount: number = 0
): AgentGroup[] {
  const installedSet = new Set(
    [...installedAgents, ...assumedInstalledAgents].filter((id) => id in agentConfig)
  );
  const hasInstalledCustom = customConnectedCount > 0;
  const allAgentIds = Object.keys(agentConfig) as AgentProviderId[];

  const installedOptions: AgentOption[] = allAgentIds
    .filter((id) => installedSet.has(id))
    .map((id) => ({ value: id, label: agentConfig[id].name, agentId: id, disabled: false }));

  const notInstalledOptions: AgentOption[] = allAgentIds
    .filter((id) => !installedSet.has(id))
    .map((id) => ({ value: id, label: agentConfig[id].name, agentId: id, disabled: true }));

  const groups: AgentGroup[] = [];
  if (installedOptions.length > 0 || hasInstalledCustom) {
    groups.push({ value: 'installed', label: 'Installed', items: installedOptions });
  }
  if (notInstalledOptions.length > 0) {
    groups.push({ value: 'not-installed', label: 'Not installed', items: notInstalledOptions });
  }
  return groups;
}

/** Build AgentOption entries from custom agents */
export function buildCustomAgentOptions(
  customAgents: CustomAgentEntry[],
  connectedIds: Set<string>
): AgentOption[] {
  return customAgents.map((entry) => ({
    value: entry.id,
    label: entry.name,
    agentId: entry.id,
    disabled: !connectedIds.has(entry.id),
    isCustom: true,
  }));
}

/** Merge custom agent options into the appropriate group(s) */
export function mergeCustomAgentsIntoGroups(
  groups: AgentGroup[],
  customOptions: AgentOption[]
): AgentGroup[] {
  if (customOptions.length === 0) return groups;

  const installedCustom = customOptions.filter((o) => !o.disabled);
  const notInstalledCustom = customOptions.filter((o) => o.disabled);

  const result: AgentGroup[] = [];
  for (const group of groups) {
    if (group.value === 'installed' && installedCustom.length > 0) {
      result.push({ ...group, items: [...group.items, ...installedCustom] });
    } else if (group.value === 'not-installed' && notInstalledCustom.length > 0) {
      result.push({ ...group, items: [...group.items, ...notInstalledCustom] });
    } else {
      result.push(group);
    }
  }

  // If no built-in groups exist, create groups from custom agents only
  if (result.length === 0) {
    if (installedCustom.length > 0) {
      result.push({ value: 'installed', label: 'Installed', items: installedCustom });
    }
    if (notInstalledCustom.length > 0) {
      result.push({ value: 'not-installed', label: 'Not installed', items: notInstalledCustom });
    }
  }

  return result;
}

export function canInstallAgentOption(item: AgentOption, allowInstall: boolean): boolean {
  return allowInstall && item.disabled && !item.isCustom;
}

export function getAssumedInstalledAgents(
  value: string | null,
  dependencyData: Record<string, unknown> | null
): string[] {
  return value && dependencyData?.[value] === undefined ? [value] : [];
}

export function isComboboxOptionDisabled(item: AgentOption): boolean {
  return item.disabled;
}

export function getInstallButtonState(
  item: AgentOption,
  allowInstall: boolean,
  installingAgents: ReadonlySet<AgentProviderId>
): { render: boolean; disabled: boolean; installing: boolean; label: string } {
  return getAgentInstallActionState({
    agentId: item.agentId as AgentProviderId,
    canInstall: allowInstall,
    isInstalled: !item.disabled,
    isInstalling: installingAgents.has(item.agentId as AgentProviderId),
  });
}

import type { AgentProviderId } from './agent-provider-registry';

export type AgentAutoApproveDefaults = Partial<Record<AgentProviderId, boolean>>;

export function getAgentAutoApproveDefault(
  defaults: AgentAutoApproveDefaults | undefined,
  providerId: string
): boolean {
  return defaults?.[providerId as AgentProviderId] ?? false;
}

export function resolveAgentAutoApprove(
  explicitAutoApprove: boolean | undefined,
  defaults: AgentAutoApproveDefaults | undefined,
  providerId: string
): boolean {
  return explicitAutoApprove ?? getAgentAutoApproveDefault(defaults, providerId);
}

import {
  getProvider,
  type AgentProviderDefinition,
  type AgentProviderId,
} from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { customAgentService } from '@main/core/settings/custom-agent-service';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';

export interface AgentCommandResult {
  command: string;
  args: string[];
  providerDef: AgentProviderDefinition;
  customAgent?: CustomAgentEntry;
}

export async function buildAgentCommand({
  providerId,
  autoApprove,
  initialPrompt,
  sessionId,
  isResuming,
}: {
  providerId: string;
  autoApprove?: boolean;
  initialPrompt?: string;
  sessionId: string;
  isResuming?: boolean;
}): Promise<AgentCommandResult> {
  const providerConfig = await providerOverrideSettings.getItem(providerId as AgentProviderId);
  let providerDef = getProvider(providerId as AgentProviderId);
  let customAgent: CustomAgentEntry | undefined;

  // Fallback to custom agents when not found in built-in registry
  if (!providerDef) {
    customAgent = await customAgentService.getById(providerId);
    if (customAgent) {
      providerDef = customAgentService.toProviderDefinition(customAgent);
    }
  }

  const resolvedConfig = customAgent ?? providerConfig;
  const cli = resolvedConfig?.cli ?? providerDef?.cli;

  const args: string[] = [];

  if (isResuming && resolvedConfig?.resumeFlag) {
    args.push(...resolvedConfig.resumeFlag.split(' '));
    if (resolvedConfig?.sessionIdFlag) {
      args.push(resolvedConfig.sessionIdFlag);
    }
  } else if (resolvedConfig?.sessionIdFlag) {
    args.push(resolvedConfig.sessionIdFlag, sessionId);
  }

  if (autoApprove && resolvedConfig?.autoApproveFlag) {
    args.push(resolvedConfig.autoApproveFlag);
  }

  if (!isResuming && initialPrompt && !providerDef?.useKeystrokeInjection) {
    const flag = resolvedConfig?.initialPromptFlag;
    if (flag) {
      args.push(flag, initialPrompt);
    } else {
      args.push(initialPrompt);
    }
  }

  args.push(...(resolvedConfig?.defaultArgs ?? []));

  return {
    command: cli ?? providerId,
    args,
    providerDef: providerDef ?? { id: providerId as AgentProviderId, name: providerId, cli },
    customAgent,
  };
}

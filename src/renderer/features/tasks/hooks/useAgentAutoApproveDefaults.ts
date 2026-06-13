import { getAgentAutoApproveDefault } from '@shared/agent-auto-approve-defaults';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';

export function useAgentAutoApproveDefaults() {
  const { value, isLoading, isSaving, update } = useAppSettingsKey('agentAutoApproveDefaults');
  const defaults = value ?? {};

  return {
    defaults,
    loading: isLoading,
    saving: isSaving,
    getDefault: (providerId: string) => getAgentAutoApproveDefault(defaults, providerId),
    setDefault: (providerId: string, enabled: boolean) => update({ [providerId]: enabled }),
  };
}

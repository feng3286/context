import type { AgentProviderDefinition } from '@shared/agent-provider-registry';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { err, ok, Result } from '@shared/result';
import { appSettingsService } from '@main/core/settings/settings-service';

/**
 * CRUD service for custom agents.
 * Reads/writes the 'customAgents' array in app settings.
 */
class CustomAgentService {
  async list(): Promise<CustomAgentEntry[]> {
    return appSettingsService.get('customAgents');
  }

  async getById(id: string): Promise<CustomAgentEntry | undefined> {
    const entries = await this.list();
    return entries.find((e) => e.id === id);
  }

  async create(entry: CustomAgentEntry): Promise<Result<CustomAgentEntry>> {
    const entries = await this.list();
    if (entries.some((e) => e.id === entry.id)) {
      return err(`Agent with ID "${entry.id}" already exists`);
    }
    const next = [...entries, entry];
    await appSettingsService.update('customAgents', next);
    return ok(entry);
  }

  async update(id: string, partial: Partial<CustomAgentEntry>): Promise<Result<CustomAgentEntry>> {
    const entries = await this.list();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return err(`Agent "${id}" not found`);
    }
    // If ID is being changed, check for conflicts
    if (partial.id && partial.id !== id) {
      if (entries.some((e) => e.id === partial.id)) {
        return err(`Agent ID "${partial.id}" already exists`);
      }
    }
    entries[idx] = { ...entries[idx], ...partial };
    await appSettingsService.update('customAgents', entries);
    return ok(entries[idx]);
  }

  async delete(id: string): Promise<Result<void>> {
    const entries = await this.list();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return err(`Agent "${id}" not found`);
    }
    entries.splice(idx, 1);
    await appSettingsService.update('customAgents', entries);
    return ok();
  }

  /**
   * Convert a CustomAgentEntry to an AgentProviderDefinition
   * so it can be consumed by the existing buildAgentCommand pipeline.
   */
  toProviderDefinition(entry: CustomAgentEntry): AgentProviderDefinition {
    return {
      id: entry.id as AgentProviderDefinition['id'],
      name: entry.name,
      description: `Custom agent: ${entry.name}`,
      docUrl: entry.docUrl,
      installCommand: entry.installCommand,
      commands: [entry.cli],
      versionArgs: ['--version'],
      detectable: true,
      cli: entry.cli,
      autoApproveFlag: entry.autoApproveFlag,
      initialPromptFlag: entry.initialPromptFlag,
      useKeystrokeInjection: entry.useKeystrokeInjection,
      resumeFlag: entry.resumeFlag,
      sessionIdFlag: entry.sessionIdFlag,
      defaultArgs: entry.defaultArgs,
      icon: undefined,
      alt: entry.name,
      terminalOnly: true,
      supportsHooks: false,
    };
  }
}

export const customAgentService = new CustomAgentService();

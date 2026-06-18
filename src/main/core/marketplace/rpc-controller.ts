import { createRPCController } from '@/shared/ipc/rpc';
import { log } from '@main/lib/logger';
import { getAdapters } from './adapter-registry';
import {
  defaultMarketplaceSources,
  loadMarketplaceConfig,
  saveMarketplaceConfig,
  toggleSource,
} from './config';
import { getCachedMcpCatalog, refreshMcpCatalog } from './controller';

export const marketplaceController = createRPCController({
  getSources: async () => {
    try {
      const config = await loadMarketplaceConfig();
      return { success: true, data: config.sources };
    } catch (error) {
      log.error('Failed to load marketplace config:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  saveSources: async (args: { sources: typeof defaultMarketplaceSources }) => {
    try {
      await saveMarketplaceConfig({ version: 1, sources: args.sources });
      return { success: true };
    } catch (error) {
      log.error('Failed to save marketplace config:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  toggleSource: async (args: { id: string; enabled: boolean }) => {
    try {
      const config = await toggleSource(args.id, args.enabled);
      return { success: true, data: config.sources };
    } catch (error) {
      log.error('Failed to toggle marketplace source:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  refreshMcp: async () => {
    try {
      const catalog = await refreshMcpCatalog();
      return { success: true, data: catalog };
    } catch (error) {
      log.error('Failed to refresh MCP catalog:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getCachedMcp: async () => {
    try {
      const catalog = await getCachedMcpCatalog();
      return { success: true, data: catalog };
    } catch (error) {
      log.error('Failed to get cached MCP catalog:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getAdapterTypes: async () => {
    const adapterTypes = getAdapters().map((a) => {
      const name = a.constructor.name.replace(/Adapter$/, '');
      const types = a.supportsType as (t: string) => boolean;
      // Map known types for each adapter
      let supportedTypes: string[] = [];
      if (name === 'GithubMcpRegistry') supportedTypes = ['github-mcp-registry'];
      else if (name === 'Smithery') supportedTypes = ['smithery'];
      else if (name === 'GithubRepo')
        supportedTypes = ['github-repo', 'openai-skills', 'anthropic-skills'];
      return { name, supportedTypes };
    });
    return { success: true, data: adapterTypes };
  },
});

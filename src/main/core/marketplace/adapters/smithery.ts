import type {
  MarketplaceItem,
  MarketplaceSource,
  McpMarketplaceEntry,
} from '@shared/marketplace/types';
import type { MarketplaceAdapter } from '../adapter';
import { httpsGetJson } from '../utils/http';

const SMITHERY_API = 'https://registry.smithery.ai';

interface SmitheryServer {
  id: string;
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  homepage?: string;
  verified?: boolean;
  useCount?: number;
}

interface SmitheryListResponse {
  servers: SmitheryServer[];
  pagination: { currentPage: number; pageSize: number; totalPages: number; totalCount: number };
}

export class SmitheryAdapter implements MarketplaceAdapter {
  supportsType(type: MarketplaceSource['type']): boolean {
    return type === 'smithery';
  }

  async fetchItems(source: MarketplaceSource, _query?: string): Promise<MarketplaceItem[]> {
    const headers: Record<string, string> = {};
    if (source.auth?.type === 'bearer') {
      headers['Authorization'] = `Bearer ${source.auth.token}`;
    }

    try {
      // Fetch first page (1000 servers per page should cover most)
      const data = (await httpsGetJson(
        `${SMITHERY_API}/servers?pageSize=100`
      )) as SmitheryListResponse;

      return (data.servers ?? []).map((server) => ({
        id: `smithery:${server.qualifiedName}`,
        displayName: server.displayName,
        description: server.description,
        sourceId: source.id,
        iconUrl: server.iconUrl,
        docsUrl: server.homepage,
        brandColor: '#f59e0b',
      }));
    } catch {
      return [];
    }
  }

  async resolveMcp(item: MarketplaceItem): Promise<McpMarketplaceEntry> {
    const qualifiedName = item.id.replace('smithery:', '');

    // Try to fetch detailed config from Smithery API
    const serverSlug = qualifiedName.split('/')[0];
    let defaultConfig: Record<string, unknown> = {};

    try {
      const data = (await httpsGetJson(`${SMITHERY_API}/servers/${qualifiedName}`)) as {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        remote?: { url: string };
      };

      if (data.remote?.url) {
        defaultConfig = { type: 'http' as const, url: data.remote.url };
      } else if (data.command) {
        defaultConfig = {
          command: data.command,
          args: data.args ?? [],
          env: data.env,
        };
      } else {
        defaultConfig = {
          command: 'npx',
          args: ['-y', `@smithery/cli@latest`, 'run', serverSlug],
        };
      }
    } catch {
      // Fall back to npx via Smithery CLI
      defaultConfig = {
        command: 'npx',
        args: ['-y', `@smithery/cli@latest`, 'run', serverSlug],
      };
    }

    return {
      key: qualifiedName,
      name: item.displayName,
      description: item.description,
      docsUrl: item.docsUrl ?? '',
      sourceId: item.sourceId,
      defaultConfig,
      credentialKeys: [],
      iconUrl: item.iconUrl,
      brandColor: item.brandColor,
    };
  }

  async resolveSkill(): Promise<never> {
    throw new Error('Smithery does not provide skills');
  }
}

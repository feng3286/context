import * as https from 'node:https';
import type {
  MarketplaceItem,
  MarketplaceSource,
  McpMarketplaceEntry,
} from '@shared/marketplace/types';
import type { MarketplaceAdapter } from '../adapter';

const MAX_REDIRECTS = 5;

function httpsGetJson(
  url: string,
  headers: Record<string, string> = {},
  redirectCount = 0
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (redirectCount >= MAX_REDIRECTS) {
      reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`));
      return;
    }
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'context-marketplace',
          Accept: 'application/vnd.github.v3+json',
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            const resolved = new URL(location, url).href;
            httpsGetJson(resolved, headers, redirectCount + 1).then(resolve, reject);
            return;
          }
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

interface GitHubMcpRepoItem {
  name: string;
  description?: string;
  html_url?: string;
  default_branch?: string;
}

export class GithubMcpRegistryAdapter implements MarketplaceAdapter {
  private readonly GITHUB_ORG = 'modelcontextprotocol';
  private readonly GITHUB_REPO = 'servers';

  supportsType(type: MarketplaceSource['type']): boolean {
    return type === 'github-mcp-registry';
  }

  async fetchItems(source: MarketplaceSource, _query?: string): Promise<MarketplaceItem[]> {
    const headers: Record<string, string> = {};
    if (source.auth?.type === 'github-token') {
      headers['Authorization'] = `token ${source.auth.token}`;
    }

    const url = `https://api.github.com/repos/${this.GITHUB_ORG}/${this.GITHUB_REPO}/contents/src`;
    const data = (await httpsGetJson(url, headers)) as Array<{ name: string; type: string }>;

    const dirs = data.filter((d) => d.type === 'dir');

    // For each directory, check if it contains an mcp.json or similar config
    const items: MarketplaceItem[] = [];
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          const dirContents = (await httpsGetJson(
            `https://api.github.com/repos/${this.GITHUB_ORG}/${this.GITHUB_REPO}/contents/src/${dir.name}`,
            headers
          )) as Array<{ name: string; type: string }>;

          // Look for mcp.json, server.json, or README.md
          const hasMcpConfig = dirContents.some((f) =>
            ['mcp.json', 'server.json', 'README.md'].includes(f.name)
          );

          if (hasMcpConfig) {
            items.push({
              id: `github-mcp/${dir.name}`,
              displayName: this.toDisplayName(dir.name),
              description: '',
              sourceId: source.id,
              docsUrl: `https://github.com/${this.GITHUB_ORG}/${this.GITHUB_REPO}/tree/main/src/${dir.name}`,
            });
          }
        } catch {
          // Skip servers that can't be fetched
        }
      })
    );

    return items;
  }

  async resolveMcp(item: MarketplaceItem): Promise<McpMarketplaceEntry> {
    const serverName = item.id.replace('github-mcp/', '');
    const headers: Record<string, string> = {};

    // Try to read mcp.json from the server directory
    const configUrl = `https://raw.githubusercontent.com/${this.GITHUB_ORG}/${this.GITHUB_REPO}/main/src/${serverName}/mcp.json`;
    try {
      const config = await this.fetchRawJson(configUrl, headers);
      if (config) {
        return {
          key: serverName,
          name: item.displayName,
          description: item.description,
          docsUrl: item.docsUrl ?? '',
          sourceId: item.sourceId,
          defaultConfig: config as Record<string, unknown>,
          credentialKeys: [],
        };
      }
    } catch {
      // Fall through to README parsing
    }

    // Parse README.md for installation instructions
    const readmeUrl = `https://raw.githubusercontent.com/${this.GITHUB_ORG}/${this.GITHUB_REPO}/main/src/${serverName}/README.md`;
    try {
      const readme = await this.fetchRawText(readmeUrl, headers);
      const command = this.extractCommand(readme);
      if (command) {
        return {
          key: serverName,
          name: item.displayName,
          description: item.description,
          docsUrl: item.docsUrl ?? '',
          sourceId: item.sourceId,
          defaultConfig: { command, args: [] },
          credentialKeys: [],
        };
      }
    } catch {
      // Skip
    }

    throw new Error(`Could not resolve MCP config for ${serverName}`);
  }

  async resolveSkill(): Promise<never> {
    throw new Error('GitHub MCP Registry does not provide skills');
  }

  // --- Private helpers ---

  private toDisplayName(name: string): string {
    return name
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private extractCommand(readme: string): string | null {
    // Look for npx, uvx, or npm install commands in code blocks
    const npxMatch = readme.match(/```(?:bash|sh|shell)?\s*\n\s*npx\s+([^\n]+)/);
    if (npxMatch) return `npx ${npxMatch[1].trim()}`;

    const uvxMatch = readme.match(/```(?:bash|sh|shell)?\s*\n\s*uvx\s+([^\n]+)/);
    if (uvxMatch) return `uvx ${uvxMatch[1].trim()}`;

    const npmMatch = readme.match(/```(?:bash|sh|shell)?\s*\n\s*npm\s+install\s+(-g\s+)?([^\n]+)/);
    if (npmMatch) return `npx ${npmMatch[2].trim()}`;

    return null;
  }

  private async fetchRawJson(url: string, headers: Record<string, string>): Promise<unknown> {
    const data = await this.fetchRawText(url, headers);
    return JSON.parse(data);
  }

  private async fetchRawText(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'context-marketplace',
            ...headers,
          },
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location;
            if (location) {
              const resolved = new URL(location, url).href;
              return this.fetchRawText(resolved, headers).then(resolve, reject);
            }
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy(new Error('Request timed out'));
      });
    });
  }
}

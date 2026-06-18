import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MarketplaceSource } from '@shared/marketplace/types';

const CONFIG_DIR = path.join(os.homedir(), '.context');
const CONFIG_PATH = path.join(CONFIG_DIR, 'marketplaces.json');

/** Default built-in marketplace sources. */
export const defaultMarketplaceSources: MarketplaceSource[] = [
  // MCP sources
  {
    id: 'builtin-mcp',
    name: 'Built-in MCP Catalog',
    kind: 'mcp',
    url: '',
    type: 'builtin-catalog',
    enabled: true,
    builtin: true,
  },
  {
    id: 'github-mcp-registry',
    name: 'GitHub MCP Registry',
    kind: 'mcp',
    url: 'https://github.com/modelcontextprotocol/servers',
    type: 'github-mcp-registry',
    enabled: true,
    builtin: true,
  },
  {
    id: 'smithery',
    name: 'Smithery',
    kind: 'mcp',
    url: 'https://smithery.ai',
    type: 'smithery',
    enabled: true,
    builtin: true,
  },
  // Skill sources
  {
    id: 'openai-skills',
    name: 'OpenAI Skills',
    kind: 'skill',
    url: 'https://github.com/openai/skills',
    type: 'openai-skills',
    enabled: true,
    builtin: true,
  },
  {
    id: 'anthropic-skills',
    name: 'Anthropic Skills',
    kind: 'skill',
    url: 'https://github.com/anthropics/skills',
    type: 'anthropic-skills',
    enabled: true,
    builtin: true,
  },
  {
    id: 'obra-superpowers',
    name: 'obra/superpowers',
    kind: 'skill',
    url: 'https://github.com/obra/superpowers',
    type: 'github-repo',
    enabled: true,
    builtin: true,
  },
];

export interface MarketplaceConfig {
  version: number;
  sources: MarketplaceSource[];
}

async function ensureConfigDir(): Promise<void> {
  await fs.promises.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadMarketplaceConfig(): Promise<MarketplaceConfig> {
  try {
    await ensureConfigDir();
    const data = await fs.promises.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(data) as MarketplaceConfig;

    // Merge with defaults: add any new builtin sources that aren't present
    const existingIds = new Set(parsed.sources.map((s) => s.id));
    const merged: MarketplaceSource[] = [...parsed.sources];
    for (const defaultSource of defaultMarketplaceSources) {
      if (!existingIds.has(defaultSource.id)) {
        merged.push(defaultSource);
      }
    }

    return { version: parsed.version ?? 1, sources: merged };
  } catch {
    return { version: 1, sources: [...defaultMarketplaceSources] };
  }
}

export async function saveMarketplaceConfig(config: MarketplaceConfig): Promise<void> {
  await ensureConfigDir();
  await fs.promises.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Get all enabled MCP sources. */
export async function getEnabledMcpSources(): Promise<MarketplaceSource[]> {
  const config = await loadMarketplaceConfig();
  return config.sources.filter((s) => s.kind === 'mcp' && s.enabled);
}

/** Get all enabled skill sources. */
export async function getEnabledSkillSources(): Promise<MarketplaceSource[]> {
  const config = await loadMarketplaceConfig();
  return config.sources.filter((s) => s.kind === 'skill' && s.enabled);
}

/** Update a single source's enabled state. */
export async function toggleSource(id: string, enabled: boolean): Promise<MarketplaceConfig> {
  const config = await loadMarketplaceConfig();
  const source = config.sources.find((s) => s.id === id);
  if (source) {
    source.enabled = enabled;
  }
  await saveMarketplaceConfig(config);
  return config;
}

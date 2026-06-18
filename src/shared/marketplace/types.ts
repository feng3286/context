/** Unified marketplace source configuration. */
export type MarketplaceKind = 'mcp' | 'skill';

export type MarketplaceType =
  | 'builtin-catalog'
  | 'github-mcp-registry'
  | 'smithery'
  | 'glama'
  | 'mcp-so'
  | 'github-repo'
  | 'openai-skills'
  | 'anthropic-skills'
  | 'json-feed';

export interface MarketplaceSource {
  /** Unique identifier, e.g. 'builtin', 'github-mcp', 'smithery' */
  id: string;
  /** Display name shown in UI */
  name: string;
  kind: MarketplaceKind;
  /** API base URL or GitHub repo path (e.g. 'github.com/owner/repo') */
  url: string;
  type: MarketplaceType;
  enabled: boolean;
  /** Built-in sources cannot be deleted, only toggled */
  builtin: boolean;
  /** Last successful fetch timestamp */
  lastFetched?: string;
  /** Optional auth for private repos/APIs */
  auth?: { type: 'bearer' | 'github-token'; token: string };
  /** Number of cached entries */
  count?: number;
}

/** Base item returned by marketplace adapters. */
export interface MarketplaceItem {
  id: string;
  displayName: string;
  description: string;
  sourceId: string;
  iconUrl?: string;
  brandColor?: string;
  docsUrl?: string;
}

/** Unified catalog entry combining MCP and skill items. */
export interface CatalogIndexResponse {
  version: number;
  lastUpdated: string;
  mcpServers: McpMarketplaceEntry[];
  skills: SkillMarketplaceEntry[];
}

/** MCP entry enriched with marketplace source info. */
export interface McpMarketplaceEntry {
  key: string;
  name: string;
  description: string;
  docsUrl: string;
  sourceId: string;
  defaultConfig: Record<string, unknown>;
  credentialKeys: Array<{ key: string; required: boolean }>;
  iconUrl?: string;
  brandColor?: string;
}

/** Skill entry enriched with marketplace source info. */
export interface SkillMarketplaceEntry {
  id: string;
  displayName: string;
  description: string;
  source: 'openai' | 'anthropic' | 'github' | 'local';
  sourceId: string;
  sourceUrl?: string;
  iconUrl?: string;
  brandColor?: string;
  defaultPrompt?: string;
  frontmatter: { name: string; description: string };
  installed: boolean;
  localPath?: string;
  skillMdContent?: string;
}

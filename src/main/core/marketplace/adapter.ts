import type {
  MarketplaceItem,
  MarketplaceSource,
  McpMarketplaceEntry,
  SkillMarketplaceEntry,
} from '@shared/marketplace/types';

/** Base interface that all marketplace adapters must implement. */
export interface MarketplaceAdapter {
  /** Whether this adapter supports the given source type. */
  supportsType(type: MarketplaceSource['type']): boolean;

  /** Fetch items from the marketplace source. Returns items in canonical form. */
  fetchItems(source: MarketplaceSource, query?: string): Promise<MarketplaceItem[]>;

  /** Resolve a marketplace item to an MCP catalog entry. Throws if not supported. */
  resolveMcp(item: MarketplaceItem): Promise<McpMarketplaceEntry>;

  /** Resolve a marketplace item to a skill catalog entry. Throws if not supported. */
  resolveSkill(item: MarketplaceItem): Promise<SkillMarketplaceEntry>;
}

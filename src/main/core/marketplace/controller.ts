import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  MarketplaceItem,
  MarketplaceSource,
  McpMarketplaceEntry,
} from '@shared/marketplace/types';
import type { McpCatalogEntry } from '@shared/mcp/types';
import { log } from '@main/lib/logger';
import { loadCatalog as loadBuiltinCatalog } from '../mcp/utils/catalog';
import { getAdapterForType } from './adapter-registry';
import { getEnabledMcpSources, loadMarketplaceConfig } from './config';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CACHE_PATH = path.join(os.homedir(), '.context', 'mcp-catalog.json');

interface CachedMarketplaceData {
  entries: McpCatalogEntry[];
  fetchedAt: string;
  sourceId: string;
}

interface DiskCache {
  version: number;
  timestamp: number;
  sources: CachedMarketplaceData[];
}

let cache: CachedMarketplaceData[] = [];
let cacheTimestamp = 0;
let backgroundRefresh: Promise<void> | null = null;

/** Load disk cache if available and not expired. */
function loadDiskCache(): CachedMarketplaceData[] | null {
  try {
    const data = fs.readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(data) as DiskCache;
    const now = Date.now();
    if (now - parsed.timestamp < CACHE_TTL_MS) {
      return parsed.sources;
    }
  } catch {
    // No disk cache or invalid data
  }
  return null;
}

/** Save cache to disk. */
async function saveDiskCache(sources: CachedMarketplaceData[]): Promise<void> {
  try {
    const cacheDir = path.dirname(CACHE_PATH);
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const diskCache: DiskCache = {
      version: 1,
      timestamp: Date.now(),
      sources,
    };
    await fs.promises.writeFile(CACHE_PATH, JSON.stringify(diskCache, null, 2));
  } catch (err) {
    log.warn('Failed to save MCP catalog disk cache:', err);
  }
}

/** Convert a McpMarketplaceEntry to the legacy McpCatalogEntry shape. */
function marketEntryToCatalogEntry(entry: McpMarketplaceEntry): McpCatalogEntry {
  return {
    key: entry.key,
    name: entry.name,
    description: entry.description,
    docsUrl: entry.docsUrl,
    defaultConfig: entry.defaultConfig,
    credentialKeys: entry.credentialKeys,
    sourceId: entry.sourceId,
    iconUrl: entry.iconUrl,
    brandColor: entry.brandColor,
  };
}

/** Fetch a single source via adapter. */
async function fetchSource(source: MarketplaceSource): Promise<CachedMarketplaceData> {
  let entries: McpCatalogEntry[] = [];

  if (source.type === 'builtin-catalog') {
    const builtin = loadBuiltinCatalog();
    entries = builtin.map((e) => ({ ...e, sourceId: source.id }));
  } else {
    const adapter = getAdapterForType(source.type);
    if (!adapter) {
      return { entries: [], fetchedAt: new Date().toISOString(), sourceId: source.id };
    }

    const headers: Record<string, string> = {};
    if (source.auth?.type === 'github-token') {
      headers['Authorization'] = `token ${source.auth.token}`;
    } else if (source.auth?.type === 'bearer') {
      headers['Authorization'] = `Bearer ${source.auth.token}`;
    }

    try {
      const items = await adapter.fetchItems(source);
      for (const item of items) {
        try {
          const resolved = await adapter.resolveMcp(item);
          entries.push(marketEntryToCatalogEntry(resolved));
        } catch {
          // Skip unresolvable items
        }
      }
    } catch (err) {
      log.warn(`Failed to fetch from ${source.id}:`, err);
    }
  }

  return {
    entries,
    fetchedAt: new Date().toISOString(),
    sourceId: source.id,
  };
}

/** Fetch all enabled MCP sources and update cache. */
async function fetchAllSources(): Promise<CachedMarketplaceData[]> {
  const config = await loadMarketplaceConfig();
  const sources = config.sources.filter((s) => s.kind === 'mcp' && s.enabled);

  const results = await Promise.allSettled(sources.map(fetchSource));
  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<CachedMarketplaceData> => r.status === 'fulfilled')
    .map((r) => r.value);

  return fulfilled;
}

/**
 * Get cached MCP catalog entries.
 * Returns disk cache immediately if available, triggers background refresh if cache is expired.
 */
export async function getCachedMcpCatalog(): Promise<McpCatalogEntry[]> {
  const now = Date.now();

  // In-memory cache still valid
  if (cache.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cache.flatMap((c) => c.entries);
  }

  // Try disk cache for instant response
  const diskData = loadDiskCache();
  if (diskData) {
    cache = diskData;
    cacheTimestamp = now;

    // Trigger background refresh (only one at a time)
    if (!backgroundRefresh) {
      backgroundRefresh = (async () => {
        try {
          const fresh = await fetchAllSources();
          cache = fresh;
          cacheTimestamp = Date.now();
          await saveDiskCache(fresh);
        } catch (err) {
          log.warn('Background MCP catalog refresh failed:', err);
        } finally {
          backgroundRefresh = null;
        }
      })();
    }

    return cache.flatMap((c) => c.entries);
  }

  // No cache at all — fetch synchronously
  cache = [];
  const fresh = await fetchAllSources();
  cache = fresh;
  cacheTimestamp = now;
  await saveDiskCache(fresh);

  return cache.flatMap((c) => c.entries);
}

/** Force refresh the cache (wait for completion). */
export async function refreshMcpCatalog(): Promise<McpCatalogEntry[]> {
  cache = [];
  cacheTimestamp = 0;
  backgroundRefresh = null;
  const fresh = await fetchAllSources();
  cache = fresh;
  cacheTimestamp = Date.now();
  await saveDiskCache(fresh);
  return cache.flatMap((c) => c.entries);
}

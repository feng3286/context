import type { CatalogSkill } from '@shared/skills/types';
import { log } from '@main/lib/logger';
import { getAdapterForType } from './adapter-registry';
import { getEnabledSkillSources } from './config';

/** Fetch skills from marketplace sources via the adapter system. */
export async function fetchMarketplaceSkills(): Promise<CatalogSkill[]> {
  const sources = await getEnabledSkillSources();
  const results: CatalogSkill[] = [];

  const fetchPromises = sources.map(async (source) => {
    if (source.type === 'builtin-catalog') return [] as CatalogSkill[];

    const adapter = getAdapterForType(source.type);
    if (!adapter) return [] as CatalogSkill[];

    try {
      const items = await adapter.fetchItems(source);
      const skills: CatalogSkill[] = [];

      for (const item of items) {
        try {
          const resolved = await adapter.resolveSkill(item);
          skills.push({
            id: resolved.id,
            displayName: resolved.displayName,
            description: resolved.description,
            source: resolved.source,
            sourceUrl: resolved.sourceUrl,
            iconUrl: resolved.iconUrl,
            brandColor: resolved.brandColor,
            frontmatter: resolved.frontmatter,
            installed: false,
            skillMdContent: resolved.skillMdContent,
          });
        } catch {
          // Skip unresolvable items
        }
      }

      return skills;
    } catch (err) {
      log.warn(`Failed to fetch skills from ${source.id}:`, err);
      return [] as CatalogSkill[];
    }
  });

  const remoteResults = await Promise.allSettled(fetchPromises);
  for (const result of remoteResults) {
    if (result.status === 'fulfilled') {
      results.push(...result.value);
    }
  }

  return results;
}

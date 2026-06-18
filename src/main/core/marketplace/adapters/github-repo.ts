import * as https from 'node:https';
import type {
  MarketplaceItem,
  MarketplaceSource,
  SkillMarketplaceEntry,
} from '@shared/marketplace/types';
import type { MarketplaceAdapter } from '../adapter';

const MAX_REDIRECTS = 5;

function httpsGet(
  url: string,
  headers: Record<string, string> = {},
  redirectCount = 0
): Promise<string> {
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
            httpsGet(resolved, headers, redirectCount + 1).then(resolve, reject);
            return;
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

/** Simple YAML frontmatter parser for SKILL.md files. */
function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };

  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  const descMatch = match[1].match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
  };
}

interface GitHubDirEntry {
  name: string;
  type: string;
  html_url?: string;
  path?: string;
}

export class GithubRepoAdapter implements MarketplaceAdapter {
  supportsType(type: MarketplaceSource['type']): boolean {
    return type === 'github-repo' || type === 'openai-skills' || type === 'anthropic-skills';
  }

  async fetchItems(source: MarketplaceSource, _query?: string): Promise<MarketplaceItem[]> {
    const headers: Record<string, string> = {};
    if (source.auth?.type === 'github-token') {
      headers['Authorization'] = `token ${source.auth.token}`;
    }

    // Extract owner/repo from URL
    const repoPath = this.extractRepoPath(source.url);
    if (!repoPath) return [];

    // Try common skill directories
    const skillDirs = this.inferSkillDirs(source.type);

    const items: MarketplaceItem[] = [];

    for (const dir of skillDirs) {
      try {
        const entries = JSON.parse(
          await httpsGet(`https://api.github.com/repos/${repoPath}/contents/${dir}`, headers)
        ) as GitHubDirEntry[];

        const skillDirs_only = entries.filter((e) => e.type === 'dir');

        await Promise.all(
          skillDirs_only.map(async (entry) => {
            try {
              // Check if SKILL.md exists
              await httpsGet(
                `https://raw.githubusercontent.com/${repoPath}/main/${dir}/${entry.name}/SKILL.md`,
                headers
              );

              // Fetch SKILL.md for frontmatter
              const skillMd = await httpsGet(
                `https://raw.githubusercontent.com/${repoPath}/main/${dir}/${entry.name}/SKILL.md`,
                headers
              );
              const { name, description } = parseFrontmatter(skillMd);

              items.push({
                id: `github:${repoPath}/${dir}/${entry.name}`,
                displayName: name || this.toDisplayName(entry.name),
                description,
                sourceId: source.id,
                iconUrl: undefined,
                docsUrl: entry.html_url,
              });
            } catch {
              // No SKILL.md in this directory, skip
            }
          })
        );
      } catch {
        // Directory doesn't exist or can't be accessed
      }
    }

    return items;
  }

  async resolveMcp(): Promise<never> {
    throw new Error('GitHub repo adapter does not provide MCP configs');
  }

  async resolveSkill(item: MarketplaceItem): Promise<SkillMarketplaceEntry> {
    // Extract repo path and skill dir from item.id
    const parts = item.id.replace('github:', '').split('/');
    if (parts.length < 4) {
      throw new Error(`Invalid skill ID format: ${item.id}`);
    }

    const [owner, repo, _dir, skillName] = parts;
    const repoPath = `${owner}/${repo}`;

    // Fetch full SKILL.md content
    const skillMdUrl = `https://raw.githubusercontent.com/${repoPath}/main/${_dir}/${skillName}/SKILL.md`;
    let skillMdContent = '';
    try {
      skillMdContent = await httpsGet(skillMdUrl);
    } catch {
      // Use empty content
    }

    const { name, description } = parseFrontmatter(skillMdContent);

    return {
      id: skillName,
      displayName: item.displayName,
      description: description || item.description,
      source: 'github',
      sourceId: item.sourceId,
      sourceUrl: item.docsUrl,
      iconUrl: item.iconUrl,
      brandColor: item.brandColor,
      frontmatter: { name: name || skillName, description: description || item.description },
      installed: false,
      skillMdContent: skillMdContent || undefined,
    };
  }

  // --- Private helpers ---

  private extractRepoPath(url: string): string | null {
    // Support formats like:
    // https://github.com/owner/repo
    // github.com/owner/repo
    // owner/repo
    const match =
      url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/) || url.match(/^([^/]+\/[^/]+?)(?:\/|$)/);
    return match ? match[1] : null;
  }

  private inferSkillDirs(type: MarketplaceSource['type']): string[] {
    switch (type) {
      case 'openai-skills':
        return ['skills/.curated', 'skills/.system'];
      case 'anthropic-skills':
        return ['skills'];
      case 'github-repo':
        return ['skills', 'src/skills', '.curated'];
      default:
        return ['skills'];
    }
  }

  private toDisplayName(name: string): string {
    return name
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

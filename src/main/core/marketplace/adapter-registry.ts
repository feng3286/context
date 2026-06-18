import type { MarketplaceAdapter } from './adapter';
import { GithubMcpRegistryAdapter } from './adapters/github-mcp-registry';
import { GithubRepoAdapter } from './adapters/github-repo';
import { SmitheryAdapter } from './adapters/smithery';

const adapters: MarketplaceAdapter[] = [
  new GithubMcpRegistryAdapter(),
  new SmitheryAdapter(),
  new GithubRepoAdapter(),
];

export function getAdapterForType(type: string): MarketplaceAdapter | undefined {
  return adapters.find((a) => a.supportsType(type as Parameters<typeof a.supportsType>[0]));
}

export function getAdapters(): MarketplaceAdapter[] {
  return adapters;
}

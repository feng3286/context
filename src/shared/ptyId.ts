import { AGENT_PROVIDER_IDS, type AgentProviderId } from './agent-provider-registry';

const CONV_SEP = '-conv-';

// Legacy separators — used only for snapshot migration fallback lookups.
const LEGACY_MAIN_SEP = '-main-';
const LEGACY_CHAT_SEP = '-chat-';

export function makePtyId(provider: string, conversationId: string): string {
  return `${provider}${CONV_SEP}${conversationId}`;
}

export function parsePtyId(id: string): {
  providerId: string;
  conversationId: string;
} | null {
  // Try known provider IDs first (longest-first to avoid prefix collisions).
  const candidates: Array<AgentProviderId | 'shell'> = [
    'shell',
    ...[...AGENT_PROVIDER_IDS].sort((a, b) => b.length - a.length),
  ];
  for (const pid of candidates) {
    const prefix = pid + CONV_SEP;
    if (id.startsWith(prefix)) {
      return { providerId: pid, conversationId: id.slice(prefix.length) };
    }
  }
  // Fallback: try splitting on the separator for custom provider IDs.
  const sepIdx = id.indexOf(CONV_SEP);
  if (sepIdx > 0) {
    return {
      providerId: id.slice(0, sepIdx),
      conversationId: id.slice(sepIdx + CONV_SEP.length),
    };
  }
  return null;
}

/**
 * Try to parse a legacy PTY ID (pre-refactor format: {prov}-main-{taskId} or {prov}-chat-{convId}).
 * Used only by TerminalSnapshotService for one-time fallback lookups on existing snapshots.
 */
export function parseLegacyPtyId(id: string): {
  providerId: AgentProviderId;
  kind: 'main' | 'chat';
  suffix: string;
} | null {
  const sorted = [...AGENT_PROVIDER_IDS].sort((a, b) => b.length - a.length);
  for (const pid of sorted) {
    if (id.startsWith(pid + LEGACY_MAIN_SEP)) {
      return {
        providerId: pid,
        kind: 'main',
        suffix: id.slice(pid.length + LEGACY_MAIN_SEP.length),
      };
    }
    if (id.startsWith(pid + LEGACY_CHAT_SEP)) {
      return {
        providerId: pid,
        kind: 'chat',
        suffix: id.slice(pid.length + LEGACY_CHAT_SEP.length),
      };
    }
  }
  return null;
}

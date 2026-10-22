import { claudeParser } from './claude';
import { codexParser } from './codex';
import type { TranscriptParser } from './types';

const PARSERS: TranscriptParser[] = [claudeParser, codexParser];

/** Providers without a parser render the chat view in "unsupported" mode. */
export function getParser(providerId: string): TranscriptParser | null {
  return PARSERS.find((parser) => parser.provider === providerId) ?? null;
}

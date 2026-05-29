import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveLegacyDatabasePath(userDataPath: string): string {
  return join(userDataPath, 'context.db');
}

export function hasLegacyDatabaseFile(userDataPath: string): boolean {
  return existsSync(resolveLegacyDatabasePath(userDataPath));
}

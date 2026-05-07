import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { app } from 'electron';
import { resolveDefaultDatabasePath } from './database-file';
import { CURRENT_DB_FILENAME, PREVIOUS_DB_FILENAME } from './default-path';

export interface ResolveDatabasePathOptions {
  userDataPath?: string;
}

export function resolveDatabasePath(options: ResolveDatabasePathOptions = {}): string {
  const explicitDbFile = process.env.EMDASH_DB_FILE?.trim();
  if (explicitDbFile) {
    const resolvedPath = resolve(explicitDbFile);
    // Ensure directory exists for explicit path (e.g., dev database)
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return resolvedPath;
  }

  return resolveDefaultDatabasePath(options.userDataPath ?? app.getPath('userData'));
}

export const databaseFilenames = {
  current: CURRENT_DB_FILENAME,
  previous: PREVIOUS_DB_FILENAME,
};
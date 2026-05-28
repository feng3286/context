import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

let logFilePath: string | null = null;
let logDir: string | null = null;

function ensureLogDir(): string {
  if (!logDir) {
    logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  return logDir;
}

function getLogFilePath(): string {
  if (!logFilePath) {
    logFilePath = path.join(ensureLogDir(), 'errors.log');
  }
  return logFilePath;
}

/** Format a single error entry for the log file. */
export function formatErrorLine(
  _level: string,
  args: unknown[],
  source: 'main' | 'renderer' = 'main',
  context?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const parts: string[] = [`[${ts}]`, `[error]`, `[${source}]`];
  for (const arg of args) {
    if (arg instanceof Error) {
      parts.push(arg.stack || `${arg.name}: ${arg.message}`);
    } else if (typeof arg === 'string') {
      parts.push(arg);
    } else {
      try {
        parts.push(JSON.stringify(arg));
      } catch {
        parts.push(String(arg));
      }
    }
  }
  if (context) {
    try {
      parts.push(JSON.stringify(context));
    } catch {
      // skip
    }
  }
  return parts.join(' ') + '\n';
}

/** Synchronously append an error line to the log file. Safe to call during shutdown. */
export function writeErrorLine(line: string): void {
  try {
    const filePath = getLogFilePath();
    // Rotate if file exceeds limit
    try {
      const stat = fs.statSync(filePath);
      if (stat.size >= MAX_LOG_SIZE) {
        const rotated = filePath + '.1';
        try {
          fs.unlinkSync(rotated);
        } catch {
          // old rotated file doesn't exist
        }
        fs.renameSync(filePath, rotated);
      }
    } catch {
      // File doesn't exist yet, or stat failed -- proceed to create
    }
    fs.appendFileSync(filePath, line);
  } catch {
    // If the userData directory is unavailable, silently drop.
  }
}

/** Callback compatible with the shared logger's `onError` hook. */
export function onErrorFromLogger(args: unknown[]): void {
  const line = formatErrorLine('error', args, 'main');
  writeErrorLine(line);
}

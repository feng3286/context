import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRPCController } from '@shared/ipc/rpc';
import type { OpenInAppId } from '@shared/openInApps';
import { capture } from '@main/lib/telemetry';
import { formatErrorLine, writeErrorLine } from '@main/lib/error-log-writer';
import { appService } from './service';

const LOG_FILE = path.join(process.cwd(), '.dev-data', 'renderer-debug.log');

export const appController = createRPCController({
  debugLog: (args: { tag: string; msg: string; data?: unknown }) => {
    const ts = new Date().toISOString();
    const dataStr = args.data !== undefined ? JSON.stringify(args.data) : '';
    const line = `${ts} [Renderer ${args.tag}] ${args.msg} ${dataStr}\n`;
    // Append to file so logs survive app crash
    try {
      fs.appendFileSync(LOG_FILE, line);
    } catch {
      // Ignore if directory doesn't exist yet
    }
    console.log(line.trimEnd());
    return { ok: true };
  },
  errorLog: (args: {
    message: string;
    stack?: string;
    component?: string;
    severity?: string;
    errorType?: string;
    context?: Record<string, unknown>;
  }) => {
    const error = new Error(args.message);
    if (args.stack) error.stack = args.stack;
    const line = formatErrorLine(
      args.severity ?? 'error',
      [error],
      'renderer',
      args.context
        ? {
            component: args.component,
            errorType: args.errorType,
            severity: args.severity,
            ...args.context,
          }
        : undefined,
    );
    writeErrorLine(line);
    return { ok: true };
  },
  openExternal: async (url: string) => {
    try {
      await appService.openExternal(url);
      capture('open_in_external', { app: 'browser' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  clipboardWriteText: async (text: string) => {
    try {
      appService.clipboardWriteText(text);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  openIn: async (args: {
    app: OpenInAppId;
    path: string;
    filePath?: string;
    lineNumber?: number;
    isRemote?: boolean;
    sshConnectionId?: string | null;
    projectId?: string;
  }) => {
    try {
      await appService.openIn(args);
      capture('open_in_external', { app: args.app, has_file: Boolean(args.filePath) });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  checkInstalledApps: () => appService.checkInstalledApps(),
  listInstalledFonts: async (args?: { refresh?: boolean }) => {
    const { fonts, cached, error } = await appService.listInstalledFonts(args?.refresh);
    return { success: !error, fonts, cached, ...(error ? { error } : {}) };
  },
  openSelectDirectoryDialog: (args: { title: string; message: string }) =>
    appService.openSelectDirectoryDialog(args),
  getAppVersion: () => appService.getCachedAppVersion(),
  getElectronVersion: () => process.versions.electron,
  getPlatform: () => process.platform,
});

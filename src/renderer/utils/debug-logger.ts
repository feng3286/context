import { rpc } from '@renderer/lib/ipc';

export function debugLog(tag: string, msg: string, data?: unknown): void {
  void rpc.app.debugLog({ tag, msg, data: data ? { ...data } : undefined });
}

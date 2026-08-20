import type * as monaco from 'monaco-editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result } from '@shared/result';

/**
 * Tests for the unregister-before-register race in MonacoModelRegistry,
 * plus the deleted-file (null content) disk model behavior.
 *
 * Monaco and the RPC transport are faked; notifyMonacoReady() resolves the
 * registry's internal readiness promise, so tests control when disk
 * registrations complete by resolving the faked electronAPI.invoke for
 * the "fs.readFile" channel.
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakeModel {
  getValue(): string;
  setValue(v: string): void;
  isDisposed(): boolean;
  dispose(): void;
}

/** Minimal Monaco namespace — only Uri.parse and editor.getModel/createModel are used. */
function fakeMonaco(): typeof monaco {
  const models = new Map<string, FakeModel>();
  return {
    Uri: { parse: (s: string) => ({ toString: () => s }) },
    editor: {
      getModel: (uri: { toString(): string }) => models.get(uri.toString()),
      createModel: (content: string, _language: string, uri: { toString(): string }) => {
        let value = content;
        let disposed = false;
        const model: FakeModel = {
          getValue: () => value,
          setValue: (v: string) => {
            value = v;
          },
          isDisposed: () => disposed,
          dispose: () => {
            disposed = true;
          },
        };
        models.set(uri.toString(), model);
        return model;
      },
    },
  } as unknown as typeof monaco;
}

type ReadFileResult = Result<{ content: string | null; truncated: boolean; totalSize: number }>;

// Install the electron preload shim BEFORE importing anything that pulls in
// @renderer/lib/ipc — the rpc singleton binds window.electronAPI.invoke at
// module-init time, so a beforeEach shim would be too late.
const invokeMock = vi.fn((channel: string) => {
  if (channel === 'fs.readFile') return currentReadFileDeferred?.promise;
  return Promise.resolve(undefined);
});
let currentReadFileDeferred: Deferred<ReadFileResult> | null = null;

(globalThis as Record<string, unknown>).window = {
  electronAPI: {
    invoke: (...args: unknown[]) => invokeMock(...(args as [string])),
    eventSend: () => {},
    eventOn: () => () => {},
  },
};

describe('MonacoModelRegistry pending-registration race', () => {
  let registry: import('./monaco-model-registry').MonacoModelRegistry;
  let readFileDeferred: Deferred<ReadFileResult>;

  const diskUri = 'disk:///project%3Ap1/a.ts';

  beforeEach(async () => {
    readFileDeferred = deferred<ReadFileResult>();
    currentReadFileDeferred = readFileDeferred;

    const { MonacoModelRegistry } = await import('./monaco-model-registry');
    registry = new MonacoModelRegistry();
    registry.notifyMonacoReady(fakeMonaco());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockClear();
    currentReadFileDeferred = null;
  });

  it('applies an unregister that arrives before registerDisk completes (no orphaned refs:1)', async () => {
    const regPromise = registry.registerModel('p1', 'w1', 'workspace:w1', 'a.ts', 'ts', 'disk');
    await Promise.resolve(); // let registerDisk reach the awaited fetch

    // Unregister before the fetch resolves — previously a silent no-op that
    // orphaned the entry created afterwards.
    registry.unregisterModel(diskUri);

    readFileDeferred.resolve({
      success: true,
      data: { content: 'hello', truncated: false, totalSize: 5 },
    });
    await regPromise;

    // The model entry must not exist — its only owner already gave up on it.
    expect(registry.getModelByUri(diskUri)).toBeUndefined();
  });

  it('still creates the entry when no racing unregister happens', async () => {
    const regPromise = registry.registerModel('p1', 'w1', 'workspace:w1', 'a.ts', 'ts', 'disk');
    readFileDeferred.resolve({
      success: true,
      data: { content: 'hello', truncated: false, totalSize: 5 },
    });
    await regPromise;

    const model = registry.getModelByUri(diskUri);
    expect(model).toBeDefined();
    expect(model?.getValue()).toBe('hello');
    // maxBytes is passed so disk reads use the same 512 KB cap as the git side.
    expect(invokeMock).toHaveBeenCalledWith('fs.readFile', 'p1', 'w1', 'a.ts', 512 * 1024);
  });

  it('treats a truncated disk read as missing instead of rendering phantom deletions', async () => {
    // Regression: >200 KB files were read with the 200 KB default and silently
    // truncated; every line past the truncation point showed as deleted in the
    // diff view even when the file was unchanged past its first 200 KB.
    const regPromise = registry.registerModel('p1', 'w1', 'workspace:w1', 'big.ts', 'ts', 'disk');
    const bigDiskUri = 'disk:///project%3Ap1/big.ts';
    readFileDeferred.resolve({
      success: true,
      data: { content: 'first 512KB only', truncated: true, totalSize: 470_000 },
    });
    await regPromise;

    const model = registry.getModelByUri(bigDiskUri);
    expect(model).toBeDefined();
    expect(model?.getValue()).toBe('');
    expect(registry.modelStatus.get(bigDiskUri)).toBe('ready');
  });

  it('renders a missing disk file (deleted unstaged file) as an empty ready model', async () => {
    const regPromise = registry.registerModel('p1', 'w1', 'workspace:w1', 'gone.ts', 'ts', 'disk');
    const goneDiskUri = 'disk:///project%3Ap1/gone.ts';
    readFileDeferred.resolve({
      success: true,
      data: { content: null, truncated: false, totalSize: 0 },
    });
    await regPromise;

    const model = registry.getModelByUri(goneDiskUri);
    expect(model).toBeDefined();
    expect(model?.getValue()).toBe('');
    expect(registry.modelStatus.get(goneDiskUri)).toBe('ready');
  });

  it('drops pending unregisters when the registration fails instead of poisoning the next one', async () => {
    const first = registry.registerModel('p1', 'w1', 'workspace:w1', 'a.ts', 'ts', 'disk');
    await Promise.resolve();
    registry.unregisterModel(diskUri);
    readFileDeferred.reject(new Error('boom'));
    await expect(first).rejects.toThrow('boom'); // Second registration for the same URI must not inherit the stale pending
    // unregister from the failed first attempt.
    const secondDeferred = deferred<ReadFileResult>();
    invokeMock.mockImplementation((channel: string) =>
      channel === 'fs.readFile' ? secondDeferred.promise : Promise.resolve(undefined)
    );
    const second = registry.registerModel('p1', 'w1', 'workspace:w1', 'a.ts', 'ts', 'disk');
    secondDeferred.resolve({
      success: true,
      data: { content: 'ok', truncated: false, totalSize: 2 },
    });
    await second;

    const model = registry.getModelByUri(diskUri);
    expect(model).toBeDefined();
    expect(model?.getValue()).toBe('ok');
  });
});

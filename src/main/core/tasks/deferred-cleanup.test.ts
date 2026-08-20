import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { moveToTrash, sweepDeferredTrash, TRASH_DIR_NAME } from './deferred-cleanup';

// Logger writes to disk / telemetry; stub it so the test stays hermetic.
vi.mock('@main/lib/logger', () => ({
  log: {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: () => {},
  },
}));

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deferred-cleanup-'));
});

afterAll(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

afterEach(async () => {
  // Clear the tmp root between tests.
  for (const entry of await fs.promises.readdir(tmpRoot)) {
    await fs.promises.rm(path.join(tmpRoot, entry), { recursive: true, force: true });
  }
});

describe('moveToTrash', () => {
  it('moves a directory into a sibling .context-trash dir', async () => {
    const workspace = path.join(tmpRoot, 'mine');
    const target = path.join(workspace, '11111');
    await fs.promises.mkdir(path.join(target, 'context', 'node_modules'), { recursive: true });
    await fs.promises.writeFile(path.join(target, 'context', 'node_modules', 'x.txt'), 'hello');

    const dest = await moveToTrash(target);

    expect(dest).not.toBeNull();
    expect(dest).toContain(TRASH_DIR_NAME);
    // Original task path is gone.
    expect(fs.existsSync(target)).toBe(false);
    // Contents survived inside the trash dir.
    expect(dest && fs.existsSync(path.join(dest!, 'context', 'node_modules', 'x.txt'))).toBe(true);
    // Trash sits as a sibling of where the task lived.
    expect(path.dirname(dest!)).toBe(path.join(workspace, TRASH_DIR_NAME));
  });

  it('returns null (without throwing) when the source does not exist', async () => {
    const dest = await moveToTrash(path.join(tmpRoot, 'does-not-exist'));
    expect(dest).toBeNull();
  });
});

describe('sweepDeferredTrash', () => {
  it('removes trashed entries and leaves the workspace dir clean', async () => {
    const workspace = path.join(tmpRoot, 'mine');
    const trashDir = path.join(workspace, TRASH_DIR_NAME);
    const trashed = path.join(trashDir, 'oldtask-123');
    await fs.promises.mkdir(path.join(trashed, 'sub'), { recursive: true });
    await fs.promises.writeFile(path.join(trashed, 'sub', 'f.txt'), 'x');

    await sweepDeferredTrash(tmpRoot);

    // Trashed content is gone.
    expect(fs.existsSync(trashed)).toBe(false);
    // The now-empty trash dir is removed too.
    expect(fs.existsSync(trashDir)).toBe(false);
  });

  it('is a no-op when the worktree root has no trash dirs', async () => {
    const workspace = path.join(tmpRoot, 'clean-ws');
    await fs.promises.mkdir(workspace, { recursive: true });
    await expect(sweepDeferredTrash(tmpRoot)).resolves.toBeUndefined();
    expect(fs.existsSync(workspace)).toBe(true);
  });

  it('ignores a missing worktree root without throwing', async () => {
    await expect(sweepDeferredTrash(path.join(tmpRoot, 'no-such-root'))).resolves.toBeUndefined();
  });
});

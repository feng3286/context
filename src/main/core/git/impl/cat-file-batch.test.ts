import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatFileBatch, disposeCatFileBatchesUnder } from './cat-file-batch';

function makeTempRepo(at?: string): string {
  const dir = at ?? mkdtempSync(join(tmpdir(), 'emdash-catfile-'));
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "t@test.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'a.txt'), 'hello\n');
  execSync('git add a.txt && git commit -m init', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('CatFileBatch', () => {
  it('reads blob contents via git cat-file --batch', async () => {
    const dir = makeTempRepo();
    const batch = new CatFileBatch(dir);
    try {
      const content = await batch.read('HEAD:a.txt');
      expect(content).toBe('hello\n');
    } finally {
      batch.dispose();
    }
  });

  it('resolves null for a missing path', async () => {
    const dir = makeTempRepo();
    const batch = new CatFileBatch(dir);
    try {
      expect(await batch.read('HEAD:does-not-exist.txt')).toBeNull();
    } finally {
      batch.dispose();
    }
  });

  it('rejects new reads after dispose', async () => {
    const dir = makeTempRepo();
    const batch = new CatFileBatch(dir);
    batch.dispose();
    await expect(batch.read('HEAD:a.txt')).rejects.toThrow();
  });

  it('disposeCatFileBatchesUnder disposes only batches pinned under the prefix', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'emdash-catfile-parent-'));
    const repoA = makeTempRepo(join(parent, 'task', 'repo-a'));
    const repoB = makeTempRepo();
    const batchA = new CatFileBatch(repoA);
    const batchB = new CatFileBatch(repoB);
    try {
      // Nested cwd caught by an ancestor prefix (task workDir → worktree).
      expect(disposeCatFileBatchesUnder(parent)).toEqual([repoA]);
      expect(batchA.disposed).toBe(true);
      expect(batchB.disposed).toBe(false);
      await expect(batchA.read('HEAD:a.txt')).rejects.toThrow();

      // Batches outside the prefix stay functional.
      expect(await batchB.read('HEAD:a.txt')).toBe('hello\n');

      // A fresh batch on the same path works again (GitService respawn path).
      const batchA2 = new CatFileBatch(repoA);
      try {
        expect(await batchA2.read('HEAD:a.txt')).toBe('hello\n');
      } finally {
        batchA2.dispose();
      }

      // Exact-path prefix matches its own batch.
      expect(disposeCatFileBatchesUnder(repoB)).toEqual([repoB]);
      expect(batchB.disposed).toBe(true);
    } finally {
      batchA.dispose();
      batchB.dispose();
    }
  });
});

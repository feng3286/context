import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { planEventChannel } from '@shared/events/appEvents';
import { fsWatchEventChannel } from '@shared/events/fsEvents';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok } from '@shared/result';
import { events } from '@main/lib/events';
import { projectManager } from '@main/core/projects/project-manager';
import { resolveWorkspace } from '../projects/utils';
import { getLocalExec } from '@main/core/utils/exec';
import { db } from '@main/db/client';
import { projects, taskProjects, tasks } from '@main/db/schema';
import {
  FileSystemErrorCodes,
  type FileWatcher,
  type ListOptions,
  type SearchOptions,
} from './types';

// One watcher per (projectId, workspaceId) pair, shared across all consumers via labels.
// Local: single recursive @parcel/watcher subscription — update() is a no-op.
// SSH:   poll-based — update() receives the union of all labels' paths to poll.
const watcherRegistry = new Map<string, FileWatcher>();
// Per-label path groups, keyed by `${projectId}::${workspaceId}` → label → paths.
// Paths are forwarded to update() for SSH compatibility; local ignores them.
const watcherLabeledPaths = new Map<string, Map<string, string[]>>();

export const filesController = createRPCController({
  listFiles: async (
    projectId: string,
    workspaceId: string,
    dirPath: string,
    options?: ListOptions
  ) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const result = await env.fs.list(dirPath, options);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  readFile: async (projectId: string, workspaceId: string, filePath: string, maxBytes?: number) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const result = await env.fs.read(filePath, maxBytes);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  writeFile: async (projectId: string, workspaceId: string, filePath: string, content: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const result = await env.fs.write(filePath, content);
      return ok(result);
    } catch (e) {
      if (
        e instanceof Error &&
        (e as unknown as { code?: string }).code === FileSystemErrorCodes.PERMISSION_DENIED
      ) {
        events.emit(planEventChannel, {
          type: 'write_blocked' as const,
          root: projectId,
          relPath: filePath,
          message: e.message,
        });
      }
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  removeFile: async (projectId: string, workspaceId: string, filePath: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    if (!env.fs.remove) {
      return err({
        type: 'fs_error' as const,
        message: 'remove not supported by this filesystem',
      });
    }

    try {
      const result = await env.fs.remove(filePath);
      return ok(result);
    } catch (e) {
      if (
        e instanceof Error &&
        (e as unknown as { code?: string }).code === FileSystemErrorCodes.PERMISSION_DENIED
      ) {
        events.emit(planEventChannel, {
          type: 'remove_blocked' as const,
          root: projectId,
          relPath: filePath,
          message: e.message,
        });
      }
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  readImage: async (projectId: string, workspaceId: string, filePath: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    if (!env.fs.readImage) {
      return err({
        type: 'fs_error' as const,
        message: 'readImage not supported by this filesystem',
      });
    }

    try {
      const result = await env.fs.readImage(filePath);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  searchFiles: async (
    projectId: string,
    workspaceId: string,
    query: string,
    options?: SearchOptions
  ) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const result = await env.fs.search(query, options);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  statFile: async (projectId: string, workspaceId: string, filePath: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const entry = await env.fs.stat(filePath);
      return ok({ entry });
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  fileExists: async (projectId: string, workspaceId: string, filePath: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    try {
      const exists = await env.fs.exists(filePath);
      return ok({ exists });
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  getProjectConfig: async (projectId: string, workspaceId: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    if (!env.fs.getProjectConfig) {
      return err({
        type: 'fs_error' as const,
        message: 'getProjectConfig not supported by this filesystem',
      });
    }

    try {
      const result = await env.fs.getProjectConfig();
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  saveProjectConfig: async (projectId: string, workspaceId: string, content: string) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    if (!env.fs.saveProjectConfig) {
      return err({
        type: 'fs_error' as const,
        message: 'saveProjectConfig not supported by this filesystem',
      });
    }

    try {
      const result = await env.fs.saveProjectConfig(content);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  saveAttachment: async (
    projectId: string,
    workspaceId: string,
    srcPath: string,
    subdir?: string
  ) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env)
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });

    if (!env.fs.saveAttachment) {
      return err({
        type: 'fs_error' as const,
        message: 'saveAttachment not supported by this filesystem',
      });
    }

    try {
      const result = await env.fs.saveAttachment(srcPath, subdir);
      return ok(result);
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  watchSetPaths: async (
    projectId: string,
    workspaceId: string,
    paths: string[],
    label = 'default'
  ) => {
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env) {
      return err({ type: 'not_found' as const, entity: 'filesystem' as const, detail: undefined });
    }

    if (!env.fs.watch) {
      return ok({ supported: false as const });
    }

    const key = `${projectId}::${workspaceId}`;
    const groups = watcherLabeledPaths.get(key) ?? new Map<string, string[]>();
    groups.set(label, paths);
    watcherLabeledPaths.set(key, groups);
    const union = [...new Set([...groups.values()].flat())];

    const existing = watcherRegistry.get(key);
    if (existing) {
      existing.update(union);
    } else {
      const watcher = env.fs.watch((evts) => {
        events.emit(fsWatchEventChannel, { projectId, workspaceId, events: evts });
      });
      watcher.update(union);
      watcherRegistry.set(key, watcher);
    }
    return ok({ supported: true as const });
  },

  watchStop: async (projectId: string, workspaceId: string, label = 'default') => {
    const key = `${projectId}::${workspaceId}`;
    const groups = watcherLabeledPaths.get(key);
    groups?.delete(label);

    if (!groups?.size) {
      watcherLabeledPaths.delete(key);
      watcherRegistry.get(key)?.close();
      watcherRegistry.delete(key);
    } else {
      const union = [...new Set([...groups.values()].flat())];
      watcherRegistry.get(key)?.update(union);
    }
    return ok({});
  },

  listTaskRootFiles: async (taskId: string) => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!row?.workDir) return err({ type: 'not_found' as const, entity: 'task_root' as const });

    const taskProjectRows = await db
      .select()
      .from(taskProjects)
      .where(eq(taskProjects.taskId, taskId));

    const projectIds = taskProjectRows.map((r) => r.projectId);
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    const projectNames = new Set(projectRows.map((r) => r.name));

    try {
      const entries = await fs.readdir(row.workDir, { withFileTypes: true });
      const files = entries
        .filter((e) => !projectNames.has(e.name))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }));
      return ok({ path: row.workDir, files });
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  readTaskRootFile: async (taskId: string, filePath: string) => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!row?.workDir) return err({ type: 'not_found' as const, entity: 'task_root' as const });

    try {
      const fullPath = path.resolve(row.workDir, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return ok({ content });
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },

  getWorktreeBranch: async (worktreePath: string) => {
    try {
      const localExec = getLocalExec();
      const { stdout } = await localExec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: worktreePath,
      });
      const branch = stdout.trim();
      return ok({ branch: branch === 'HEAD' ? null : branch });
    } catch (e) {
      return err({ type: 'fs_error' as const, message: String(e) });
    }
  },
});

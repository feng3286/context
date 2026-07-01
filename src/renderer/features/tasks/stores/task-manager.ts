import { makeObservable, observable, reaction, runInAction } from 'mobx';
import { prSyncProgressChannel, prUpdatedChannel } from '@shared/events/prEvents';
import { taskDeletedChannel, taskStatusUpdatedChannel } from '@shared/events/taskEvents';
import type { Task, TaskLifecycleStatus } from '@shared/tasks';
import type { TaskViewSnapshot } from '@shared/view-state';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import type { RepositoryStore } from '@renderer/features/projects/stores/repository-store';
import { events, rpc } from '@renderer/lib/ipc';
import {
  createUnprovisionedTask,
  isProvisioned,
  isRegistered,
  isUnprovisioned,
  isUnregistered,
  TaskStore,
} from './task';

export class TaskManagerStore {
  private readonly projectId: string;
  private readonly _repository: RepositoryStore;
  private _loadPromise: Promise<void> | null = null;
  private _teardownPromises = new Map<string, Promise<void>>();
  private _provisionPromises = new Map<string, Promise<void>>();

  private _unsubPrUpdated: (() => void) | null = null;
  private _unsubPrSyncProgress: (() => void) | null = null;
  private _unsubTaskDeleted: (() => void) | null = null;
  private _disposeRepositoryReaction: (() => void) | null = null;

  tasks = observable.map<string, TaskStore>();

  constructor(projectId: string, repository: RepositoryStore) {
    this.projectId = projectId;
    this._repository = repository;
    makeObservable(this, { tasks: observable });

    events.on(taskStatusUpdatedChannel, ({ taskId, workspaceId, status }) => {
      const store = this.tasks.get(taskId);
      if (!store) return;
      const taskWorkspaceId = (store.data as Task).workspaceId;
      if (taskWorkspaceId && taskWorkspaceId !== workspaceId) return;
      if (isProvisioned(store)) {
        runInAction(() => {
          store.data.status = status as TaskLifecycleStatus;
        });
      }
    });

    this._unsubPrUpdated = events.on(prUpdatedChannel, ({ prs }) => {
      const repoUrl = this._repository.repositoryUrl;
      if (!repoUrl) return;
      for (const pr of prs) {
        if (pr.repositoryUrl !== repoUrl) continue;
        for (const [, store] of this.tasks) {
          if (!isRegistered(store)) continue;
          const task = store.data as Task;
          if (task.taskBranch !== pr.headRefName) continue;
          runInAction(() => {
            const idx = task.prs.findIndex((p) => p.url === pr.url);
            if (idx >= 0) {
              task.prs.splice(idx, 1, pr);
            } else {
              task.prs.push(pr);
            }
          });
        }
      }
    });

    this._unsubPrSyncProgress = events.on(prSyncProgressChannel, (progress) => {
      if (progress.status !== 'done') return;
      const repoUrl = this._repository.repositoryUrl;
      if (!repoUrl || progress.remoteUrl !== repoUrl) return;
      for (const [, store] of this.tasks) {
        if (isRegistered(store)) {
          void this._reloadPrsForTask(store);
        }
      }
    });

    this._unsubTaskDeleted = events.on(taskDeletedChannel, ({ taskId, workspaceId }) => {
      const store = this.tasks.get(taskId);
      if (!store) return;

      // Only delete from this store if the task belongs to this workspace
      const taskWorkspaceId = (store.data as Task).workspaceId;
      if (taskWorkspaceId !== workspaceId) return;

      store.dispose();
      runInAction(() => {
        this.tasks.delete(taskId);
      });
    });

    this._disposeRepositoryReaction = reaction(
      () => this._repository.repositoryUrl,
      () => {
        for (const [, store] of this.tasks) {
          if (isRegistered(store)) {
            void this._reloadPrsForTask(store);
          }
        }
      }
    );
  }

  private async _reloadPrsForTask(store: TaskStore): Promise<void> {
    if (!isRegistered(store)) return;
    const result = await rpc.pullRequests.getPullRequestsForTask(this.projectId, store.data.id);
    if (!result.success) return;
    const prs = result.prs ?? [];
    runInAction(() => {
      if (isRegistered(store)) {
        (store.data as Task).prs = prs;
      }
    });
  }

  loadTasks(): Promise<void> {
    if (!this._loadPromise) {
      this._loadPromise = rpc.tasks
        .getTasks(this.projectId)
        .then((tasks) => {
          runInAction(() => {
            for (const t of tasks) {
              this.tasks.set(t.id, createUnprovisionedTask(t));
            }
          });
          const reloadPromises = tasks.flatMap((t) => {
            const store = this.tasks.get(t.id);
            return store && isRegistered(store) ? [this._reloadPrsForTask(store)] : [];
          });
          void Promise.all(reloadPromises);
        })
        .catch((e) => {
          console.error('Error loading tasks', e);
        });
    }
    return this._loadPromise;
  }

  reloadTasks(): Promise<void> {
    this._loadPromise = null;
    return this.loadTasks();
  }

  async provisionTask(taskId: string): Promise<void> {
    await getProjectManagerStore().mountProject(this.projectId);
    await this.loadTasks();

    const inFlight = this._provisionPromises.get(taskId);
    if (inFlight) return inFlight;

    const task = this.tasks.get(taskId);
    if (!task || !isUnprovisioned(task)) return;

    runInAction(() => {
      task.phase = 'provision';
    });

    const promise = Promise.all([
      rpc.tasks.provisionTask(taskId),
      rpc.viewState.get(`task:${taskId}`),
    ])
      .then(([result, savedSnapshot]) => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            const updatedData = {
              ...current.data,
              lastInteractedAt: new Date().toISOString(),
            } as Task;
            current.transitionToProvisioned(
              updatedData,
              result.path,
              this._repository,
              this.projectId,
              savedSnapshot as TaskViewSnapshot | undefined
            );
            current.activate();

            // Sync provisioning to other projects for multi-project tasks
            const pt = current.provisionedTask;
            if (pt && (current.data as Task).workspaceId) {
              const projectManager = getProjectManagerStore();
              for (const [pid, project] of projectManager.projects) {
                if (pid === this.projectId) continue;
                const otherStore = project.mountedProject?.taskManager.tasks.get(taskId);
                if (otherStore && isUnprovisioned(otherStore)) {
                  otherStore.transitionToSharedProvisioned(updatedData, pt);
                }
              }
            }
          }
        });
      })
      .catch((err: unknown) => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            current.phase = 'provision-error';
            current.errorMessage = err instanceof Error ? err.message : String(err);
          }
        });
        throw err;
      })
      .finally(() => {
        this._provisionPromises.delete(taskId);
      });

    this._provisionPromises.set(taskId, promise);
    return promise;
  }

  async openTask(taskId: string): Promise<void> {
    await getProjectManagerStore().mountProject(this.projectId);
    await this.loadTasks();

    const inFlight = this._provisionPromises.get(taskId);
    if (inFlight) return inFlight;

    const task = this.tasks.get(taskId);
    if (!task || !isUnprovisioned(task)) return;

    runInAction(() => {
      task.phase = 'provision';
    });

    const promise = Promise.all([rpc.tasks.openTask(taskId), rpc.viewState.get(`task:${taskId}`)])
      .then(([result, savedSnapshot]) => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            const updatedData = {
              ...current.data,
              lastInteractedAt: new Date().toISOString(),
            } as Task;
            current.transitionToProvisioned(
              updatedData,
              result.path,
              this._repository,
              this.projectId,
              savedSnapshot as TaskViewSnapshot | undefined
            );
            // Store branch mismatch info from the RPC result
            if (current.provisionedTask) {
              current.provisionedTask.branchMismatches = result.branchMismatches ?? [];
            }
            current.activate();

            // Sync provisioning to other projects for multi-project tasks
            const pt = current.provisionedTask;
            if (pt && (current.data as Task).workspaceId) {
              const projectManager = getProjectManagerStore();
              for (const [pid, project] of projectManager.projects) {
                if (pid === this.projectId) continue;
                const otherStore = project.mountedProject?.taskManager.tasks.get(taskId);
                if (otherStore && isUnprovisioned(otherStore)) {
                  otherStore.transitionToSharedProvisioned(updatedData, pt);
                }
              }
            }
          }
        });
      })
      .catch((err: unknown) => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            current.phase = 'provision-error';
            current.errorMessage = err instanceof Error ? err.message : String(err);
          }
        });
        throw err;
      })
      .finally(() => {
        this._provisionPromises.delete(taskId);
      });

    this._provisionPromises.set(taskId, promise);
    return promise;
  }

  async teardownTask(taskId: string): Promise<void> {
    const inFlight = this._teardownPromises.get(taskId);
    if (inFlight) return inFlight;

    const task = this.tasks.get(taskId);
    if (!task) return;

    runInAction(() => {
      const current = this.tasks.get(taskId);
      if (!current) return;
      if (isProvisioned(current)) {
        current.transitionToUnprovisioned({ ...current.data }, 'teardown');
      } else if (isUnprovisioned(current)) {
        current.phase = 'teardown';
      }
    });

    const promise = rpc.tasks
      .teardownTask(taskId)
      .then(() => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            current.phase = 'idle';
          }
        });
      })
      .catch((err: unknown) => {
        runInAction(() => {
          const current = this.tasks.get(taskId);
          if (current && isUnprovisioned(current)) {
            current.phase = 'teardown-error';
          }
        });
        throw err;
      })
      .finally(() => {
        this._teardownPromises.delete(taskId);
      });

    this._teardownPromises.set(taskId, promise);
    return promise;
  }

  async setTaskPinned(taskId: string, isPinned: boolean): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    await task.setPinned(isPinned);
  }

  async archiveTask(taskId: string): Promise<void> {
    const currentTask = this.tasks.get(taskId);
    if (!currentTask || !isRegistered(currentTask)) return;
    const previousArchivedAt = currentTask.data.archivedAt;

    try {
      runInAction(() => {
        const task = this.tasks.get(taskId);
        if (task && isRegistered(task)) {
          task.data.archivedAt = new Date().toISOString();
        }
      });
      await rpc.tasks.archiveTask(taskId);
      void this.teardownTask(taskId).catch(() => {});
    } catch (e) {
      runInAction(() => {
        const task = this.tasks.get(taskId);
        if (task && isRegistered(task)) {
          task.data.archivedAt = previousArchivedAt;
        }
      });
      throw e;
    }
  }

  async restoreTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !isRegistered(task)) return;
    const archivedAt = task.data.archivedAt;

    try {
      await rpc.tasks.restoreTask(taskId);
      runInAction(() => {
        const current = this.tasks.get(taskId);
        if (current && isRegistered(current)) {
          current.data.archivedAt = undefined;
        }
      });
    } catch (e) {
      runInAction(() => {
        const current = this.tasks.get(taskId);
        if (current && isRegistered(current)) {
          current.data.archivedAt = archivedAt;
        }
      });
      throw e;
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    runInAction(() => {
      this.tasks.delete(taskId);
    });

    try {
      task.dispose();
      await rpc.tasks.deleteTask(taskId);
    } catch (e) {
      runInAction(() => {
        this.tasks.set(taskId, task);
      });
      throw e;
    }
  }

  dispose(): void {
    this._unsubPrUpdated?.();
    this._unsubPrUpdated = null;
    this._unsubPrSyncProgress?.();
    this._unsubPrSyncProgress = null;
    this._unsubTaskDeleted?.();
    this._unsubTaskDeleted = null;
    this._disposeRepositoryReaction?.();
    this._disposeRepositoryReaction = null;
  }
}

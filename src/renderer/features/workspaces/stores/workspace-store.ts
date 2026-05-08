import { makeObservable, observable, runInAction } from 'mobx';
import type { Conversation } from '@shared/conversations';
import type { Project } from '@shared/projects';
import type { Task } from '@shared/tasks';
import type { Workspace } from '@shared/workspaces';
import { rpc } from '@renderer/lib/ipc';

export type WorkspaceLifecycleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export type WorkspaceStore =
  | UnloadedWorkspaceStore
  | LoadingWorkspaceStore
  | ReadyWorkspaceStore
  | ErrorWorkspaceStore;

interface BaseWorkspaceStore {
  data: Workspace;
}

export interface UnloadedWorkspaceStore extends BaseWorkspaceStore {
  status: 'unloaded';
}

export interface LoadingWorkspaceStore extends BaseWorkspaceStore {
  status: 'loading';
}

export interface ReadyWorkspaceStore extends BaseWorkspaceStore {
  status: 'ready';
  projects: Project[];
  tasks: Task[];
}

export interface ErrorWorkspaceStore extends BaseWorkspaceStore {
  status: 'error';
  error: string;
}

export function createUnloadedWorkspace(data: Workspace): UnloadedWorkspaceStore {
  return { data, status: 'unloaded' };
}

export class WorkspaceStoreClass {
  data: Workspace;
  status: WorkspaceLifecycleStatus = 'unloaded';
  projects: Project[] = [];
  tasks: Task[] = [];
  error: string | undefined = undefined;
  private _loadPromise: Promise<void> | null = null;

  constructor(data: Workspace) {
    this.data = data;
    makeObservable(this, {
      data: observable,
      status: observable,
      projects: observable,
      tasks: observable,
      error: observable,
    });
  }

  load(): Promise<void> {
    if (this.status === 'loading') {
      return this._loadPromise ?? Promise.resolve();
    }

    runInAction(() => {
      this.status = 'loading';
    });

    this._loadPromise = Promise.all([
      rpc.workspace.getWorkspaceProjects(this.data.id),
      rpc.tasks.getTasksByWorkspace(this.data.id),
    ])
      .then(([projects, tasks]) => {
        runInAction(() => {
          this.projects = projects;
          this.tasks = tasks;
          this.status = 'ready';
          this.error = undefined;
        });
      })
      .catch((err) => {
        runInAction(() => {
          this.status = 'error';
          this.error = err instanceof Error ? err.message : String(err);
        });
      })
      .finally(() => {
        this._loadPromise = null;
      });

    return this._loadPromise;
  }

  async addProject(projectId: string): Promise<void> {
    await rpc.workspace.addProjectToWorkspace(this.data.id, projectId);
    await this.load();
  }

  async removeProject(projectId: string): Promise<void> {
    await rpc.workspace.removeProjectFromWorkspace(this.data.id, projectId);
    await this.load();
  }

  async loadConversationsForTask(taskId: string): Promise<Conversation[]> {
    return rpc.conversations.getConversationsForTask(taskId);
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await rpc.tasks.deleteTask(projectId, taskId);
    await this.load();
  }
}

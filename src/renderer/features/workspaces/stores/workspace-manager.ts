import { makeObservable, observable, runInAction } from 'mobx';
import type { CreateWorkspaceParams, Workspace } from '@shared/workspaces';
import { rpc } from '@renderer/lib/ipc';
import { WorkspaceStoreClass } from './workspace-store';

export class WorkspaceManagerStore {
  workspaces = observable.map<string, WorkspaceStoreClass>();
  private _loadPromise: Promise<void> | null = null;

  constructor() {
    makeObservable(this, { workspaces: observable });
  }

  load(): Promise<void> {
    if (!this._loadPromise) {
      this._loadPromise = this._doLoad();
    }
    return this._loadPromise;
  }

  private async _doLoad(): Promise<void> {
    const workspaceList = await rpc.workspace.listWorkspaces();
    runInAction(() => {
      for (const w of workspaceList) {
        this.workspaces.set(w.id, new WorkspaceStoreClass(w));
      }
    });
  }

  async createWorkspace(params: CreateWorkspaceParams): Promise<string> {
    const workspace = await rpc.workspace.createWorkspace(params);
    runInAction(() => {
      this.workspaces.set(workspace.id, new WorkspaceStoreClass(workspace));
    });
    return workspace.id;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await rpc.workspace.deleteWorkspace(id);
    runInAction(() => {
      const store = this.workspaces.get(id);
      store?.dispose();
      this.workspaces.delete(id);
    });
  }

  getWorkspace(id: string): WorkspaceStoreClass | undefined {
    return this.workspaces.get(id);
  }

  /** Returns the first ready workspace that contains the given project. */
  getWorkspaceStoreForProject(projectId: string): WorkspaceStoreClass | undefined {
    for (const store of this.workspaces.values()) {
      if (store.status === 'ready' && store.projects.some((p) => p.id === projectId)) {
        return store;
      }
    }
    return undefined;
  }
}

// Singleton
export const workspaceManagerStore = new WorkspaceManagerStore();

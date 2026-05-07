import { makeObservable, observable, runInAction } from 'mobx';
import type { CreateWorkspaceParams, Workspace } from '@shared/workspaces';
import { rpc } from '@renderer/lib/ipc';
import {
  createUnloadedWorkspace,
  WorkspaceStoreClass,
  type WorkspaceStore,
} from './workspace-store';

export class WorkspaceManagerStore {
  workspaces = observable.map<string, WorkspaceStore>();
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
        this.workspaces.set(w.id, createUnloadedWorkspace(w));
      }
    });
  }

  async createWorkspace(params: CreateWorkspaceParams): Promise<string> {
    const workspace = await rpc.workspace.createWorkspace(params);
    runInAction(() => {
      this.workspaces.set(workspace.id, createUnloadedWorkspace(workspace));
    });
    return workspace.id;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await rpc.workspace.deleteWorkspace(id);
    runInAction(() => {
      this.workspaces.delete(id);
    });
  }

  getWorkspace(id: string): WorkspaceStore | undefined {
    return this.workspaces.get(id);
  }
}

// Singleton
export const workspaceManagerStore = new WorkspaceManagerStore();

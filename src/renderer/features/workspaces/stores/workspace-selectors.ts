import type { Project } from '@shared/projects';
import { workspaceManagerStore } from './workspace-manager';
import { WorkspaceStoreClass, type ReadyWorkspaceStore } from './workspace-store';

export function getWorkspaceStore(id: string): WorkspaceStoreClass | undefined {
  return workspaceManagerStore.getWorkspace(id);
}

export function asReadyWorkspace(store: WorkspaceStoreClass): ReadyWorkspaceStore | undefined {
  return store.status === 'ready'
    ? { data: store.data, status: 'ready', projects: store.projects, tasks: store.tasks }
    : undefined;
}

export function getWorkspaceProjects(id: string): Project[] | undefined {
  const store = getWorkspaceStore(id);
  if (store && store.status === 'ready') {
    return store.projects;
  }
  return undefined;
}

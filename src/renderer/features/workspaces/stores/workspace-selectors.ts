import type { Project } from '@shared/projects';
import { workspaceManagerStore } from './workspace-manager';
import type { WorkspaceStore, ReadyWorkspaceStore } from './workspace-store';

export function getWorkspaceStore(id: string): WorkspaceStore | undefined {
  return workspaceManagerStore.getWorkspace(id);
}

export function asReadyWorkspace(store: WorkspaceStore): ReadyWorkspaceStore | undefined {
  return store.status === 'ready' ? store : undefined;
}

export function getWorkspaceProjects(id: string): Project[] | undefined {
  const store = getWorkspaceStore(id);
  if (store && store.status === 'ready') {
    return store.projects;
  }
  return undefined;
}
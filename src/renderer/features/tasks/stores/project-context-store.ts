import { makeAutoObservable, observable } from 'mobx';
import type { TaskProjectContext } from '@shared/task-projects';
import type { RepositoryStore } from '@renderer/features/projects/stores/repository-store';
import { rpc } from '@renderer/lib/ipc';
import { GitStore } from '../diff-view/stores/git-store';
import { FilesStore } from '../editor/stores/files-store';

/**
 * Per-project context for multi-project tasks.
 * Contains the project info and its stores for files/git operations.
 */
export class ProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly worktreePath: string | null;
  readonly git: GitStore;
  readonly files: FilesStore;

  constructor(context: TaskProjectContext, workspaceId: string, repositoryStore: RepositoryStore) {
    this.projectId = context.projectId;
    this.projectName = context.projectName;
    this.worktreePath = context.worktreePath;
    // Use the task's workspaceId for git/files stores
    // The workspaceId is derived from taskBranch which is shared across all projects
    this.git = new GitStore(context.projectId, workspaceId, repositoryStore);
    this.files = new FilesStore(context.projectId, workspaceId);

    makeAutoObservable(this, {
      git: false,
      files: false,
    });
  }

  activate(): void {
    this.git.startWatching();
    this.files.startWatching();
  }

  dispose(): void {
    this.git.dispose();
    this.files.dispose();
  }
}

/**
 * Manages multiple project contexts for a multi-project task.
 * Each project has its own files/git stores for the worktree.
 */
export class ProjectContextStore {
  readonly projects = observable.map<string, ProjectContext>();
  readonly expandedSections = observable.set<string>();
  activeProjectId: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async loadProjectContexts(
    taskId: string,
    workspaceId: string,
    repositoryStore: RepositoryStore
  ): Promise<void> {
    // Load project contexts from backend
    const contexts = await rpc.tasks.getTaskProjectContexts(taskId);

    // Create ProjectContext for each project
    for (const context of contexts) {
      const projectContext = new ProjectContext(context, workspaceId, repositoryStore);
      this.projects.set(context.projectId, projectContext);
    }
  }

  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  toggleSection(projectId: string): void {
    if (this.expandedSections.has(projectId)) {
      this.expandedSections.delete(projectId);
    } else {
      this.expandedSections.add(projectId);
    }
  }

  isExpanded(projectId: string): boolean {
    return this.expandedSections.has(projectId);
  }

  activate(): void {
    for (const context of this.projects.values()) {
      context.activate();
    }
  }

  dispose(): void {
    for (const context of this.projects.values()) {
      context.dispose();
    }
    this.projects.clear();
    this.expandedSections.clear();
  }
}

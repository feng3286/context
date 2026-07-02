import { makeAutoObservable, observable } from 'mobx';
import type { TaskProjectContext } from '@shared/task-projects';
import type { RepositoryStore } from '@renderer/features/projects/stores/repository-store';
import { rpc } from '@renderer/lib/ipc';
import { GitStore } from '../diff-view/stores/git-store';
import { FilesStore } from '../editor/stores/files-store';
import { ProjectChangesViewStore } from './project-changes-view-store';

/**
 * Per-project context for multi-project tasks.
 * Contains the project info and its stores for files/git operations.
 */
export class ProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly worktreePath: string | null;
  readonly sourceBranch: string | null;
  actualBranch: string | null = null;
  readonly git: GitStore;
  readonly files: FilesStore;
  readonly changesView: ProjectChangesViewStore;

  constructor(context: TaskProjectContext, workspaceId: string, repositoryStore: RepositoryStore) {
    this.projectId = context.projectId;
    this.projectName = context.projectName;
    this.worktreePath = context.worktreePath;
    this.sourceBranch = context.sourceBranch;
    // Use the task's workspaceId for git/files stores
    // The workspaceId is derived from taskBranch which is shared across all projects
    this.git = new GitStore(context.projectId, workspaceId, repositoryStore);
    this.files = new FilesStore(context.projectId, workspaceId);
    this.changesView = new ProjectChangesViewStore();

    makeAutoObservable(this, {
      git: false,
      files: false,
      changesView: false,
    });
  }

  async fetchActualBranch(): Promise<void> {
    if (!this.worktreePath) return;
    const result = await rpc.fs.getWorktreeBranch(this.worktreePath);
    if (result.success) {
      this.actualBranch = result.data.branch;
    }
  }

  activate(): void {
    this.git.startWatching();
    this.files.startWatching();
  }

  dispose(): void {
    this.git.dispose();
    this.files.dispose();
    this.changesView.dispose();
  }
}

/**
 * Manages multiple project contexts for a multi-project task.
 * Each project has its own files/git stores for the worktree.
 */
export class ProjectContextStore {
  readonly projects = observable.map<string, ProjectContext>();
  readonly expandedSections = observable.set<string>();
  readonly expandedProjects = observable.set<string>();
  activeProjectId: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async loadProjectContexts(
    taskId: string,
    workspaceId: string,
    repositoryStore: RepositoryStore
  ): Promise<void> {
    const contexts = await rpc.tasks.getTaskProjectContexts(taskId);

    for (const context of contexts) {
      const projectContext = new ProjectContext(context, workspaceId, repositoryStore);
      this.projects.set(context.projectId, projectContext);
    }

    // Fetch actual git branch for each project's worktree
    await Promise.all(
      Array.from(this.projects.values()).map((ctx) => ctx.fetchActualBranch())
    );

    this.activate();
  }

  async refresh(
    taskId: string,
    workspaceId: string,
    repositoryStore: RepositoryStore
  ): Promise<void> {
    this.dispose();
    await this.loadProjectContexts(taskId, workspaceId, repositoryStore);
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

  toggleProjectExpand(projectKey: string): void {
    if (this.expandedProjects.has(projectKey)) {
      this.expandedProjects.delete(projectKey);
    } else {
      this.expandedProjects.add(projectKey);
      // Extract projectId from "project:<id>" format
      const projectId = projectKey.replace('project:', '');
      const context = this.projects.get(projectId);
      if (context && !context.files.loadedPaths.has('')) {
        void context.files.loadDir('');
      }
    }
  }

  findProjectIdForPath(path: string): string | undefined {
    // Find which project contains this path
    for (const context of this.projects.values()) {
      if (context.files.nodes.has(path) || path.startsWith(context.worktreePath ?? '')) {
        return context.projectId;
      }
    }
    return undefined;
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

import type { Project } from './projects';

export type TaskProjectContext = {
  projectId: string;
  projectName: string;
  worktreePath: string | null;
};

export type TaskProjectWithContexts = {
  taskId: string;
  projects: TaskProjectContext[];
};

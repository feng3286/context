import type { Project } from './projects';

export type TaskProjectContext = {
  projectId: string;
  projectName: string;
};

export type TaskProjectWithContexts = {
  taskId: string;
  projects: TaskProjectContext[];
};

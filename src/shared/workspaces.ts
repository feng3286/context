export type Workspace = {
  id: string;
  name: string;
  workDir?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkspaceParams = {
  id: string;
  name: string;
  workDir?: string;
  projectIds?: string[]; // Optional: projects to add on creation
};

export type UpdateWorkspaceParams = {
  name?: string;
  workDir?: string;
};

export type AddProjectToWorkspaceParams = {
  workspaceId: string;
  projectId: string;
};

export type RemoveProjectFromWorkspaceParams = {
  workspaceId: string;
  projectId: string;
};
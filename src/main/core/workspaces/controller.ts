import { createRPCController } from '@shared/ipc/rpc';
import { addProjectToWorkspace } from './operations/addProjectToWorkspace';
import { createWorkspace } from './operations/createWorkspace';
import { deleteWorkspace } from './operations/deleteWorkspace';
import { getProjectWorkspaces } from './operations/getProjectWorkspaces';
import { getWorkspace } from './operations/getWorkspace';
import { getWorkspaceProjects } from './operations/getWorkspaceProjects';
import { listWorkspaces } from './operations/listWorkspaces';
import { removeProjectFromWorkspace } from './operations/removeProjectFromWorkspace';
import { updateWorkspace } from './operations/updateWorkspace';

export const workspaceController = createRPCController({
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceProjects,
  getProjectWorkspaces,
  addProjectToWorkspace,
  removeProjectFromWorkspace,
});

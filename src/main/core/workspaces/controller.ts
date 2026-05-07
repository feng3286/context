import { createRPCController } from '@shared/ipc/rpc';
import { createWorkspace } from './operations/createWorkspace';
import { getWorkspace } from './operations/getWorkspace';
import { listWorkspaces } from './operations/listWorkspaces';
import { updateWorkspace } from './operations/updateWorkspace';
import { deleteWorkspace } from './operations/deleteWorkspace';
import { getWorkspaceProjects } from './operations/getWorkspaceProjects';
import { addProjectToWorkspace } from './operations/addProjectToWorkspace';
import { removeProjectFromWorkspace } from './operations/removeProjectFromWorkspace';

export const workspaceController = createRPCController({
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceProjects,
  addProjectToWorkspace,
  removeProjectFromWorkspace,
});
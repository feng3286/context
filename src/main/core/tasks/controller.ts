import { createRPCController } from '@shared/ipc/rpc';
import { addProjectToTask } from './addProjectToTask';
import { archiveTask } from './archiveTask';
import { createMultiProjectTask } from './createMultiProjectTask';
import { deleteTask } from './deleteTask';
import { generateTaskName } from './generateTaskName';
import { getBootstrapStatus } from './getBootstrapStatus';
import { getTasks, getTasksByWorkspace } from './getTasks';
import { getWorkspaceSettings } from './getWorkspaceSettings';
import { openTask } from './openTask';
import { getTaskProjectContexts, getTaskProjects } from './operations/getTaskProjects';
import { setTaskProjects } from './operations/setTaskProjects';
import { provisionTask } from './provisionTask';
import { renameTask } from './renameTask';
import { restoreTask } from './restoreTask';
import { setTaskPinned } from './setTaskPinned';
import { teardownTask } from './teardownTask';
import { updateLinkedIssue } from './updateLinkedIssue';
import { updateTaskStatus } from './updateTaskStatus';

export const taskController = createRPCController({
  addProjectToTask,
  createMultiProjectTask,
  getTasks,
  getTasksByWorkspace,
  deleteTask,
  generateTaskName,
  archiveTask,
  restoreTask,
  renameTask,
  openTask,
  provisionTask,
  teardownTask,
  getBootstrapStatus,
  getWorkspaceSettings,
  updateLinkedIssue,
  updateTaskStatus,
  setTaskPinned,
  getTaskProjects,
  getTaskProjectContexts,
  setTaskProjects,
});

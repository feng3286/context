import { defineEvent } from '@shared/ipc/events';
import type { PullRequest } from '@shared/pull-requests';

export const taskStatusUpdatedChannel = defineEvent<{
  taskId: string;
  workspaceId: string;
  status: string;
}>('task:status-updated');

export const taskPrUpdatedChannel = defineEvent<{
  taskId: string;
  workspaceId: string;
  prs: PullRequest[];
}>('task:pr-updated');

export const taskDeletedChannel = defineEvent<{
  taskId: string;
  workspaceId: string;
}>('task:deleted');

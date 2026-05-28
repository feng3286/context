import { PullRequest } from '@shared/pull-requests';
import { Issue, Task, TaskLifecycleStatus } from '@shared/tasks';
import { TaskRow } from '@main/db/schema';

export function mapTaskRowToTask(
  row: TaskRow,
  prs: PullRequest[] = [],
  conversations: Record<string, number> = {}
): Task {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workDir: row.workDir ?? undefined,
    name: row.name,
    status: row.status as TaskLifecycleStatus,
    taskBranch: row.taskBranch ?? undefined,
    linkedIssue: row.linkedIssue ? (JSON.parse(row.linkedIssue) as Issue) : undefined,
    archivedAt: row.archivedAt ?? undefined,
    lastInteractedAt: row.lastInteractedAt ?? undefined,
    createdAt: row.createdAt,
    prs,
    conversations,
    updatedAt: row.updatedAt,
    statusChangedAt: row.statusChangedAt,
    isPinned: row.isPinned === 1,
  };
}

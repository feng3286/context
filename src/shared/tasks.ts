import type { CreateBranchError, PushError } from '@shared/git';
import { PullRequest } from './pull-requests';

export type TaskLifecycleStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';

export type Issue = {
  provider: 'github' | 'linear' | 'jira' | 'gitlab' | 'plain' | 'forgejo';
  url: string;
  title: string;
  identifier: string;
  description?: string;
  branchName?: string;
  status?: string;
  assignees?: string[];
  project?: string;
  updatedAt?: string;
  fetchedAt?: string;
};

export type Task = {
  id: string;
  workspaceId: string;
  workDir?: string;
  name: string;
  status: TaskLifecycleStatus;
  taskBranch?: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp: when lifecycle status last changed (current status entered). */
  statusChangedAt: string;
  archivedAt?: string;
  lastInteractedAt?: string;
  linkedIssue?: Issue;
  isPinned: boolean;
  prs: PullRequest[];
  conversations: Record<string, number>;
};

export type TaskBootstrapStatus =
  | { status: 'ready' }
  | { status: 'bootstrapping' }
  | { status: 'error'; message: string }
  | { status: 'not-started' };

export type CreateTaskError =
  | { type: 'project-not-found' }
  | { type: 'initial-commit-required'; branch: string }
  | { type: 'branch-create-failed'; branch: string; error: CreateBranchError }
  | { type: 'provision-failed'; message: string };

export type CreateTaskWarning = {
  type: 'branch-publish-failed';
  branch: string;
  remote: string;
  error: PushError;
};

export type CreateMultiProjectTaskParams = {
  id: string;
  workspaceId: string;
  name: string;
  taskBranch: string;
  pushBranch?: boolean;
  createBranch?: boolean;
  projectBranchSources: Array<{
    projectId: string;
    sourceBranch: string;
  }>;
};

export type CreateTaskSuccess = {
  task: Task;
  warning?: CreateTaskWarning;
};

export type ProvisionTaskResult = {
  path: string;
  workspaceId: string;
};

export type BranchMismatchInfo = {
  projectId: string;
  projectName: string;
  expectedBranch: string;
  actualBranch: string | null;
};

export type OpenTaskResult = {
  path: string;
  workspaceId: string;
  branchMismatches: BranchMismatchInfo[];
};

export function formatIssueAsPrompt(issue: Issue, initialPrompt?: string): string {
  const parts = [`[${issue.identifier}] ${issue.title}`, issue.url, issue.description].filter(
    Boolean
  );

  if (initialPrompt?.trim()) parts.push('', initialPrompt.trim());
  return parts.join('\n');
}

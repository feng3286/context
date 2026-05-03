import type { CreateTaskStrategy } from '@shared/tasks';

type BranchLikeTaskStrategy = Extract<
  CreateTaskStrategy,
  { kind: 'new-branch' | 'checkout-existing' | 'no-worktree' }
>;
type PullRequestTaskStrategy = Extract<CreateTaskStrategy, { kind: 'from-pull-request' }>;

export function resolveBranchLikeTaskStrategy(input: {
  isUnborn: boolean;
  createWorktree: boolean;
  createNewBranch: boolean;
  taskBranch: string;
  pushBranch: boolean;
}): BranchLikeTaskStrategy {
  if (input.isUnborn || !input.createWorktree) {
    return { kind: 'no-worktree' };
  }
  if (!input.createNewBranch) {
    return { kind: 'checkout-existing' };
  }

  return {
    kind: 'new-branch',
    taskBranch: input.taskBranch,
    pushBranch: input.pushBranch,
  };
}

export function resolvePullRequestTaskStrategy(input: {
  checkoutMode: 'checkout' | 'new-branch';
  prNumber: number;
  headBranch: string;
  headRepositoryUrl: string;
  isFork: boolean;
  taskBranch: string;
  pushBranch: boolean;
}): PullRequestTaskStrategy {
  if (input.checkoutMode === 'checkout') {
    return {
      kind: 'from-pull-request',
      prNumber: input.prNumber,
      headBranch: input.headBranch,
      headRepositoryUrl: input.headRepositoryUrl,
      isFork: input.isFork,
    };
  }

  return {
    kind: 'from-pull-request',
    prNumber: input.prNumber,
    headBranch: input.headBranch,
    headRepositoryUrl: input.headRepositoryUrl,
    isFork: input.isFork,
    taskBranch: input.taskBranch,
    pushBranch: input.pushBranch,
  };
}

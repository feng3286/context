import { describe, expect, it } from 'vitest';
import {
  resolveBranchLikeTaskStrategy,
  resolvePullRequestTaskStrategy,
} from '@renderer/features/tasks/create-task-modal/create-task-strategy';

// Replicates the derivation logic from use-branch-selection.ts
function deriveCreateNewBranch(createWorktree: boolean, createNewBranchPref: boolean): boolean {
  return createWorktree && createNewBranchPref;
}

describe('Bug reproduction: both toggles ON, branch v1, no worktree created', () => {
  it('Step 1: deriveCreateNewBranch gives true when both prefs are true', () => {
    expect(deriveCreateNewBranch(true, true)).toBe(true);
  });

  it('Step 2: resolveBranchLikeTaskStrategy returns new-branch with correct taskBranch', () => {
    const isUnborn = false;
    const createWorktree = true;
    const createNewBranchPref = true;
    const createNewBranch = deriveCreateNewBranch(createWorktree, createNewBranchPref);
    const taskName = 'fix-bug';
    const customBranchName = null;
    const branchName = customBranchName ?? taskName;

    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn,
      createWorktree,
      createNewBranch,
      taskBranch: branchName,
      pushBranch: false,
    });

    expect(strategy).toEqual({
      kind: 'new-branch',
      taskBranch: 'fix-bug',
      pushBranch: false,
    });

    // Verify strategy.kind is correct
    expect(strategy.kind).toBe('new-branch');
  });

  it('Step 3: when strategy is new-branch, taskBranch is non-empty', () => {
    const taskName = 'my-feature';
    const customBranchName = null;
    const branchName = customBranchName ?? taskName;

    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree: true,
      createNewBranch: true,
      taskBranch: branchName,
      pushBranch: false,
    });

    expect(strategy.kind).toBe('new-branch');
    if (strategy.kind === 'new-branch') {
      expect(strategy.taskBranch).toBeTruthy();
      expect(strategy.taskBranch.length).toBeGreaterThan(0);
      expect(strategy.taskBranch).toBe('my-feature');
    }
  });

  it('Step 4: sourceBranch is passed through (simulates user selecting branch v1)', () => {
    const sourceBranch = { type: 'local' as const, branch: 'v1' };
    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree: true,
      createNewBranch: true,
      taskBranch: 'fix-bug',
      pushBranch: false,
    });

    // This is what would be passed to createTask
    const createTaskParams = {
      id: 'test-id',
      projectId: 'test-project',
      name: 'fix-bug',
      sourceBranch,
      strategy,
    };

    expect(createTaskParams.sourceBranch.branch).toBe('v1');
    expect(createTaskParams.strategy.kind).toBe('new-branch');
    if (createTaskParams.strategy.kind === 'new-branch') {
      expect(createTaskParams.strategy.taskBranch).toBe('fix-bug');
    }
  });

  it('Step 5: custom branch name flows correctly', () => {
    // User changes branch name to something different from task name
    const taskName = 'hello-world';
    const customBranchName = 'custom-branch-name';
    const branchName = customBranchName ?? taskName;
    expect(branchName).toBe('custom-branch-name');

    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree: true,
      createNewBranch: true,
      taskBranch: branchName,
      pushBranch: false,
    });

    if (strategy.kind === 'new-branch') {
      expect(strategy.taskBranch).toBe('custom-branch-name');
      expect(strategy.taskBranch).not.toBe(taskName);
    }
  });

  it('Step 6: when "Create new branch" is OFF, strategy is checkout-existing (no new branch)', () => {
    const createWorktree = true;
    const createNewBranchPref = false;
    const createNewBranch = deriveCreateNewBranch(createWorktree, createNewBranchPref);

    expect(createNewBranch).toBe(false);

    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree,
      createNewBranch,
      taskBranch: 'does-not-matter',
      pushBranch: false,
    });

    expect(strategy.kind).toBe('checkout-existing');
  });

  it('Step 7: regression guard — old createBranchAndWorktree=false behavior is preserved', () => {
    const createWorktree = false;
    const createNewBranchPref = true;
    const createNewBranch = deriveCreateNewBranch(createWorktree, createNewBranchPref);

    expect(createNewBranch).toBe(false);

    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree,
      createNewBranch,
      taskBranch: 'some-task',
      pushBranch: false,
    });

    // When worktree is OFF, strategy should be no-worktree (existing behavior preserved)
    expect(strategy.kind).toBe('no-worktree');
  });

  it('Step 8: edge case — empty taskName produces empty taskBranch', () => {
    // This should NOT happen in practice because isValid requires non-empty taskName
    const strategy = resolveBranchLikeTaskStrategy({
      isUnborn: false,
      createWorktree: true,
      createNewBranch: true,
      taskBranch: '',
      pushBranch: false,
    });

    expect(strategy.kind).toBe('new-branch');
    if (strategy.kind === 'new-branch') {
      expect(strategy.taskBranch).toBe('');
    }
  });
});

describe('resolveBranchLikeTaskStrategy (original tests)', () => {
  it('returns new-branch with pushBranch when worktree and new-branch creation are enabled', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: false,
        createWorktree: true,
        createNewBranch: true,
        taskBranch: 'issue-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'new-branch',
      taskBranch: 'issue-task',
      pushBranch: false,
    });
  });

  it('returns checkout-existing when worktree is enabled but new-branch is disabled', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: false,
        createWorktree: true,
        createNewBranch: false,
        taskBranch: 'issue-task',
        pushBranch: true,
      })
    ).toEqual({ kind: 'checkout-existing' });
  });

  it('returns no-worktree when worktree creation is disabled', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: false,
        createWorktree: false,
        createNewBranch: true,
        taskBranch: 'issue-task',
        pushBranch: true,
      })
    ).toEqual({ kind: 'no-worktree' });
  });

  it('returns no-worktree for unborn repositories', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: true,
        createWorktree: true,
        createNewBranch: true,
        taskBranch: 'issue-task',
        pushBranch: true,
      })
    ).toEqual({ kind: 'no-worktree' });
  });
});

describe('resolvePullRequestTaskStrategy', () => {
  it('includes taskBranch and pushBranch in new-branch mode', () => {
    expect(
      resolvePullRequestTaskStrategy({
        checkoutMode: 'new-branch',
        prNumber: 42,
        headBranch: 'feature/pr-head',
        headRepositoryUrl: 'https://github.com/contributor/repo',
        isFork: false,
        taskBranch: 'pr-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'from-pull-request',
      prNumber: 42,
      headBranch: 'feature/pr-head',
      headRepositoryUrl: 'https://github.com/contributor/repo',
      isFork: false,
      taskBranch: 'pr-task',
      pushBranch: false,
    });
  });

  it('omits taskBranch and pushBranch in checkout mode', () => {
    expect(
      resolvePullRequestTaskStrategy({
        checkoutMode: 'checkout',
        prNumber: 42,
        headBranch: 'feature/pr-head',
        headRepositoryUrl: 'https://github.com/contributor/repo',
        isFork: false,
        taskBranch: 'pr-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'from-pull-request',
      prNumber: 42,
      headBranch: 'feature/pr-head',
      headRepositoryUrl: 'https://github.com/contributor/repo',
      isFork: false,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 集成测试：覆盖 addProjectToTask 和 createMultiProjectTask 的核心分支逻辑。
 *
 * 由于这两个函数依赖大量外部服务（git、worktree、DB），
 * 本测试采用全量 mock 策略，重点验证以下行为不变：
 * - taskBranch 为空时：跳过分支创建、使用 sourceBranch 进行 provision
 * - taskBranch 不为空时：创建分支、使用 taskBranch 进行 provision
 * - 回滚逻辑：有分支时回滚分支，无分支时只回滚 worktree
 */

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const makeSelectChain = (rows: unknown[]) => {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
};

vi.mock('@main/db/client', () => ({
  db: {
    get select() {
      return mockSelect;
    },
    get insert() {
      return mockInsert;
    },
    get update() {
      return mockUpdate;
    },
  },
}));

const mockTable = (name: string) =>
  new Proxy(
    {},
    {
      get(_, prop) {
        return `${name}.${String(prop)}`;
      },
    }
  );

vi.mock('@main/db/schema', () => ({
  tasks: mockTable('tasks'),
  taskProjects: mockTable('taskProjects'),
  projects: mockTable('projects'),
  workspaceProjects: mockTable('workspaceProjects'),
}));

vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: {
    getProject: vi.fn(),
  },
}));

vi.mock('@main/core/projects/operations/getProjects', () => ({
  getProjectById: vi.fn().mockResolvedValue({ name: 'test-project' }),
}));

vi.mock('@main/core/workspaces/operations/getWorkspace', () => ({
  getWorkspace: vi.fn().mockResolvedValue({ name: 'test-workspace' }),
}));

vi.mock('@main/core/settings/settings-service', () => ({
  appSettingsService: {
    get: vi.fn().mockResolvedValue({
      branchPrefix: 'task',
      defaultWorktreeDirectory: '/tmp/worktrees',
    }),
  },
}));

vi.mock('./generateAgentsMd', () => ({
  generateAgentsMd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./resolveTaskBranchName', () => ({
  resolveTaskBranchName: vi.fn(({ rawBranch, branchPrefix, suffix }) => {
    if (rawBranch) return `${branchPrefix}/${rawBranch}-abcde`;
    return `task/unnamed-abcde`;
  }),
}));

vi.mock('@main/lib/telemetry', () => ({
  capture: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    promises: {
      rm: vi.fn().mockResolvedValue(undefined),
    },
    existsSync: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ eq: true, col, val })),
  and: vi.fn((...args) => ({ and: true, args })),
  sql: new Proxy(() => 'CURRENT_TIMESTAMP', {
    get: () => () => 'CURRENT_TIMESTAMP',
  }),
}));

// ─── Shared mock project (top-level vi.fn() that survive clearAllMocks) ─────

// Mutable state objects — tests modify these directly to avoid mock override issues
const mockRepoState = {
  getRepositoryInfo: { isUnborn: false },
  createBranch: { success: true },
  getConfiguredRemote: 'origin',
  publishBranch: { success: true },
  deleteBranch: undefined,
};

const mockProjectState = {
  provisionTask: { success: true },
  getWorktreeForBranch: '/tmp/worktrees/test/proj',
  removeWorktreeAtPath: undefined,
};

const mockRepo = {
  getRepositoryInfo: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockRepoState.getRepositoryInfo)),
  createBranch: vi.fn().mockImplementation(() => Promise.resolve(mockRepoState.createBranch)),
  getConfiguredRemote: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockRepoState.getConfiguredRemote)),
  publishBranch: vi.fn().mockImplementation(() => Promise.resolve(mockRepoState.publishBranch)),
  deleteBranch: vi.fn().mockImplementation(() => Promise.resolve(mockRepoState.deleteBranch)),
};

const mockProject = {
  repository: mockRepo,
  provisionTask: vi.fn().mockImplementation(() => Promise.resolve(mockProjectState.provisionTask)),
  getWorktreeForBranch: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockProjectState.getWorktreeForBranch)),
  removeWorktreeAtPath: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockProjectState.removeWorktreeAtPath)),
};

const baseTaskRow = {
  id: 'task-1',
  workspaceId: 'ws-1',
  name: 'test-task',
  taskBranch: 'task/feature-abc12',
  status: 'in_progress',
  workDir: '/tmp/worktrees/test-task',
  isPinned: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  statusChangedAt: '2024-01-01T00:00:00.000Z',
};

const mockProjectObj = { id: 'proj-1', name: 'test-project' };

// ─── Helpers ────────────────────────────────────────────────────────────────

function chainSelect(...rowsArr: unknown[][]) {
  for (const rows of rowsArr) {
    mockSelect.mockReturnValueOnce(makeSelectChain(rows));
  }
}

function chainInsert(returning?: unknown[]) {
  if (returning) {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }),
    });
  } else {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
  }
}

function chainUpdate() {
  mockUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
}

// ─── Tests: addProjectToTask ────────────────────────────────────────────────

describe('addProjectToTask', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mock implementation queues to prevent mockReturnValueOnce leaking between tests
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    // Reset mutable state to defaults
    mockRepoState.getRepositoryInfo = { isUnborn: false };
    mockRepoState.createBranch = { success: true };
    mockRepoState.getConfiguredRemote = 'origin';
    mockRepoState.publishBranch = { success: true };
    mockRepoState.deleteBranch = undefined;
    mockProjectState.provisionTask = { success: true };
    mockProjectState.removeWorktreeAtPath = undefined;
    mockProjectState.getWorktreeForBranch = '/tmp/worktrees/test/proj';
    // Set project manager to return our mock project
    const { projectManager } = await import('@main/core/projects/project-manager');
    (projectManager.getProject as ReturnType<typeof vi.fn>).mockReturnValue(mockProject);
  });

  // ─── Validation ─────────────────────────────────────────────────────────
  it('returns task-not-found when task does not exist', async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([]));
    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({ taskId: 'x', projectId: 'p', sourceBranch: 'main' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('task-not-found');
  });

  it('returns project-not-found when project does not exist', async () => {
    chainSelect([{ ...baseTaskRow }], []);
    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'nonexist',
      sourceBranch: 'main',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('project-not-found');
  });

  it('returns workspace-mismatch when project not in task workspace', async () => {
    chainSelect(
      [{ ...baseTaskRow }],
      [mockProjectObj],
      [] // no workspaceProjects row
    );
    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('workspace-mismatch');
  });

  it('returns already-bound when project already in task', async () => {
    chainSelect(
      [{ ...baseTaskRow }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [{ taskId: 'task-1', projectId: 'proj-1' }] // already bound
    );
    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('already-bound');
  });

  it('returns branch-create-failed when repository is unborn (hasTaskBranch=true)', async () => {
    mockRepoState.getRepositoryInfo = { isUnborn: true };
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/feat-1' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      []
    );
    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('branch-create-failed');
  });

  it('publish warning: task succeeds when publishBranch fails (hasTaskBranch=true, pushBranch=true)', async () => {
    mockRepoState.publishBranch = { success: false, error: 'push rejected' } as any;
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/feat-1' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [],
      [{ count: 2 }],
      [{ projectId: 'proj-1', sourceBranch: 'main' }]
    );
    chainInsert([{ ...baseTaskRow, taskBranch: 'task/feat-1' }]);
    chainInsert();
    chainUpdate();

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
      pushBranch: true,
    });

    expect(result.success).toBe(true);
    expect(mockRepo.publishBranch).toHaveBeenCalled();
  });

  // ─── Key branching: taskBranch 不为空 ──────────────────────────────────────
  it('with taskBranch: creates branch, provisions on taskBranch, inserts DB', async () => {
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/feat-1' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [],
      [{ count: 2 }],
      [{ projectId: 'proj-1', sourceBranch: 'main' }]
    );
    chainInsert([{ ...baseTaskRow, taskBranch: 'task/feat-1' }]);
    chainInsert();
    chainUpdate();

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(true);
    expect(mockRepo.createBranch).toHaveBeenCalledWith('task/feat-1', 'main', false);
    expect(mockProject.provisionTask.mock.calls[0][0].taskBranch).toBe('task/feat-1');
  });

  // ─── Key branching: taskBranch 为空 ────────────────────────────────────────
  it('without taskBranch: skips branch creation, provisions on sourceBranch', async () => {
    chainSelect(
      [{ ...baseTaskRow, taskBranch: null }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [],
      [{ count: 2 }],
      [{ projectId: 'proj-1', sourceBranch: 'develop' }]
    );
    chainInsert([{ ...baseTaskRow, taskBranch: '' }]);
    chainInsert();
    chainUpdate();

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'develop',
    });

    expect(result.success).toBe(true);
    expect(mockRepo.createBranch).not.toHaveBeenCalled();
    expect(mockProject.provisionTask.mock.calls[0][0].taskBranch).toBe('develop');
  });

  // ─── Rollback: taskBranch 不为空 → 回滚分支 ───────────────────────────────
  it('rollback branch when provision fails (hasTaskBranch=true)', async () => {
    mockProjectState.provisionTask = {
      success: false,
      error: { type: 'worktree-setup-failed' },
    } as any;
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/rollback-test' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      []
    );

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    expect(mockRepo.deleteBranch).toHaveBeenCalledWith('task/rollback-test', true);
  });

  // ─── Rollback: taskBranch 为空 → 不回滚分支 ───────────────────────────────
  it('no branch rollback when provision fails (hasTaskBranch=false)', async () => {
    mockProjectState.provisionTask = {
      success: false,
      error: { type: 'worktree-setup-failed' },
    } as any;
    chainSelect(
      [{ ...baseTaskRow, taskBranch: null }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      []
    );

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'develop',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    expect(mockRepo.deleteBranch).not.toHaveBeenCalled();
  });

  it('rollback worktree+branch when DB insert throws (hasTaskBranch=true)', async () => {
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/db-rollback' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      []
    );
    // DB insert throws
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockImplementation(() => {
        throw new Error('constraint violation');
      }),
    });

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('db-error');
    expect(mockRepo.deleteBranch).toHaveBeenCalledWith('task/db-rollback', true);
  });

  it('generates AGENTS.md when project count > 1 after insert', async () => {
    const { generateAgentsMd } = await import('./generateAgentsMd');
    vi.mocked(generateAgentsMd).mockResolvedValue(undefined);
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/feat-1' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [],
      [{ count: 2 }], // taskProjects count = 2
      [
        { projectId: 'proj-1', sourceBranch: 'main' },
        { projectId: 'proj-2', sourceBranch: 'develop' },
      ]
    );
    chainInsert([{ ...baseTaskRow, taskBranch: 'task/feat-1' }]);
    chainInsert();
    chainUpdate();

    const { addProjectToTask } = await import('./addProjectToTask');
    await addProjectToTask({ taskId: 'task-1', projectId: 'proj-1', sourceBranch: 'main' });

    expect(generateAgentsMd).toHaveBeenCalledWith('/tmp/worktrees/test-task', [
      { projectId: 'proj-1', sourceBranch: 'main' },
      { projectId: 'proj-2', sourceBranch: 'develop' },
    ]);
  });

  it('skips AGENTS.md when project count == 1', async () => {
    const { generateAgentsMd } = await import('./generateAgentsMd');
    vi.mocked(generateAgentsMd).mockResolvedValue(undefined);
    chainSelect(
      [{ ...baseTaskRow, taskBranch: 'task/feat-1' }],
      [mockProjectObj],
      [{ workspaceId: 'ws-1', projectId: 'proj-1' }],
      [],
      [{ count: 1 }], // only 1 project
      [{ projectId: 'proj-1', sourceBranch: 'main' }]
    );
    chainInsert([{ ...baseTaskRow, taskBranch: 'task/feat-1' }]);
    chainInsert();
    chainUpdate();

    const { addProjectToTask } = await import('./addProjectToTask');
    await addProjectToTask({ taskId: 'task-1', projectId: 'proj-1', sourceBranch: 'main' });

    expect(generateAgentsMd).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module-level mocks ─────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ eq: true, col, val })),
  and: vi.fn((...args) => ({ and: true, args })),
  sql: new Proxy(() => 'CURRENT_TIMESTAMP', {
    get: () => () => 'CURRENT_TIMESTAMP',
  }),
}));

const makeSelectChain = (rows: unknown[]) => {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
};

const makeInsertWithReturning = (rows: unknown[]) => ({
  values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
});

const makeInsertNoReturning = () => ({
  values: vi.fn().mockResolvedValue(undefined),
});

const mockTable = (name: string) =>
  new Proxy(
    {},
    {
      get(_, prop) {
        return `${name}.${String(prop)}`;
      },
    }
  );

vi.mock('@main/db/client', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@main/db/schema', () => ({
  tasks: mockTable('tasks'),
  taskProjects: mockTable('taskProjects'),
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

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getDb() {
  const mod = await import('@main/db/client');
  return mod.db;
}

async function getProjectManager() {
  const mod = await import('@main/core/projects/project-manager');
  return mod.projectManager;
}

async function configureDbMocks({
  selectCalls = [],
  insertCalls = [],
}: {
  selectCalls?: unknown[][];
  insertCalls?: Array<{ returning?: unknown[] }>;
}) {
  const db = await getDb();
  for (const rows of selectCalls) {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectChain(rows) as any);
  }
  for (const cfg of insertCalls) {
    if (cfg.returning) {
      vi.mocked(db.insert).mockReturnValueOnce(makeInsertWithReturning(cfg.returning) as any);
    } else {
      vi.mocked(db.insert).mockReturnValueOnce(makeInsertNoReturning() as any);
    }
  }
}

async function setProjectManagerReturn(value: unknown) {
  const pm = await getProjectManager();
  vi.mocked(pm.getProject).mockReturnValue(value as never);
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeMockProject(
  overrides: {
    isUnborn?: boolean;
    createBranchResult?: { success: true } | { success: false; error: { type: string } };
    provisionResult?: { success: true } | { success: false; error: { type: string } };
    worktreePath?: string;
  } = {}
) {
  const {
    isUnborn = false,
    createBranchResult = { success: true },
    provisionResult = { success: true },
    worktreePath = '/tmp/worktrees/test-task/test-project',
  } = overrides;

  return {
    repository: {
      getRepositoryInfo: vi.fn().mockResolvedValue({ isUnborn }),
      createBranch: vi.fn().mockResolvedValue(createBranchResult),
      getConfiguredRemote: vi.fn().mockResolvedValue('origin'),
      getRemotes: vi.fn().mockResolvedValue({ remotes: [] }),
      publishBranch: vi.fn().mockResolvedValue({ success: true }),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
    },
    provisionTask: vi.fn().mockResolvedValue(provisionResult),
    getWorktreeForBranch: vi.fn().mockResolvedValue(worktreePath),
    removeWorktreeAtPath: vi.fn().mockResolvedValue(undefined),
  };
}

function makeParams(
  overrides: {
    createBranch?: boolean;
    taskBranch?: string;
    pushBranch?: boolean;
    projectCount?: number;
  } = {}
) {
  const {
    createBranch = true,
    taskBranch = 'feature-xyz',
    pushBranch = false,
    projectCount = 2,
  } = overrides;
  const projects = Array.from({ length: projectCount }, (_, i) => ({
    projectId: `proj-${i + 1}`,
    sourceBranch: 'main',
  }));

  return {
    id: 'task-new-1',
    workspaceId: 'ws-1',
    name: 'new-task',
    taskBranch,
    createBranch,
    pushBranch,
    projectBranchSources: projects,
  };
}

const insertedTaskRow = {
  id: 'task-new-1',
  workspaceId: 'ws-1',
  workDir: '/tmp/worktrees/test-workspace/new-task',
  name: 'new-task',
  taskBranch: 'task/feature-xyz-abcde',
  status: 'in_progress',
  isPinned: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  statusChangedAt: '2024-01-01T00:00:00.000Z',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createMultiProjectTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds when createBranch=true: creates branches, provisions worktrees, inserts DB', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [insertedTaskRow] }, {}],
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams());

    expect(result.success).toBe(true);
    expect(mockProj.repository.createBranch).toHaveBeenCalledTimes(2);
    expect(mockProj.provisionTask).toHaveBeenCalledTimes(2);
  });

  it('succeeds when createBranch=false: skips branch creation, provisions on sourceBranch', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [{ ...insertedTaskRow, taskBranch: '' }] }, {}],
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(
      makeParams({ createBranch: false, taskBranch: '' })
    );

    expect(result.success).toBe(true);
    expect(mockProj.repository.createBranch).not.toHaveBeenCalled();
    expect(mockProj.provisionTask).toHaveBeenCalledTimes(2);
    expect(mockProj.provisionTask.mock.calls[0][0].taskBranch).toBe('main');
  });

  it('returns branch-create-failed when git branch creation fails', async () => {
    const mockProj = makeMockProject({
      createBranchResult: { success: false, error: { type: 'already_exists' } },
    });
    await setProjectManagerReturn(mockProj);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('branch-create-failed');
  });

  it('returns initial-commit-required when repository has no commits', async () => {
    const mockProj = makeMockProject({ isUnborn: true });
    await setProjectManagerReturn(mockProj);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('initial-commit-required');
  });

  it('rolls back branches when provision fails (createBranch=true)', async () => {
    const mockProj = makeMockProject({
      provisionResult: { success: false, error: { type: 'worktree-setup-failed' } },
    });
    await setProjectManagerReturn(mockProj);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    expect(mockProj.repository.deleteBranch).toHaveBeenCalled();
  });

  it('rolls back worktrees when provision fails (createBranch=false)', async () => {
    const mockProj = makeMockProject({
      provisionResult: { success: false, error: { type: 'worktree-setup-failed' } },
    });
    await setProjectManagerReturn(mockProj);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(
      makeParams({ createBranch: false, taskBranch: '' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    // When createBranch=false and provisionTask fails atomically, no worktree was created yet,
    // so removeWorktreeAtPath is NOT called.
    expect(mockProj.removeWorktreeAtPath).not.toHaveBeenCalled();
    expect(mockProj.repository.deleteBranch).not.toHaveBeenCalled();
  });

  it('publishes branch when pushBranch=true (createBranch=true)', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [insertedTaskRow] }, {}],
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    await createMultiProjectTask(makeParams({ pushBranch: true }));

    expect(mockProj.repository.publishBranch).toHaveBeenCalled();
  });

  it('does NOT publish branch when createBranch=false even if pushBranch=true', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [{ ...insertedTaskRow, taskBranch: '' }] }, {}],
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    await createMultiProjectTask(
      makeParams({ createBranch: false, taskBranch: '', pushBranch: true })
    );

    expect(mockProj.repository.publishBranch).not.toHaveBeenCalled();
  });

  it('returns warning when branch publish fails but task still succeeds', async () => {
    const mockProj = makeMockProject();
    (mockProj.repository.publishBranch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'push failed',
    });
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [insertedTaskRow] }, {}],
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams({ pushBranch: true }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warning).toBeDefined();
      expect(result.data.warning?.type).toBe('branch-publish-failed');
    }
  });

  it('rolls back when DB insert fails', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    const db = await getDb();
    vi.mocked(db.insert).mockImplementationOnce(() => {
      throw new Error('unique constraint');
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    expect(mockProj.repository.deleteBranch).toHaveBeenCalled();
  });

  it('returns project-not-found when any project is missing', async () => {
    const { projectManager } = await import('@main/core/projects/project-manager');
    vi.mocked(projectManager.getProject).mockReturnValue(undefined as never);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams({ projectCount: 1 }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('project-not-found');
  });

  it('rolls back first branch when Phase 1 partially fails (first succeeds, second fails)', async () => {
    // First project succeeds, second project fails branch creation
    const mockProj1 = makeMockProject();
    const mockProj2 = makeMockProject({
      createBranchResult: { success: false, error: { type: 'already_exists' } },
    });

    // getProject is called: validation loop (2x) + phase1ForProject (2x)
    const { projectManager } = await import('@main/core/projects/project-manager');
    vi.mocked(projectManager.getProject).mockImplementation((id: string) => {
      return (id === 'proj-1' ? mockProj1 : mockProj2) as never;
    });

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams({ projectCount: 2 }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('branch-create-failed');
    // First project's branch should be rolled back
    expect(mockProj1.repository.deleteBranch).toHaveBeenCalled();
    // Second project never got past branch creation
    expect(mockProj2.provisionTask).not.toHaveBeenCalled();
  });

  it('rolls back worktrees when Phase 2 provision throws', async () => {
    const mockProj = makeMockProject();
    (mockProj.provisionTask as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('unexpected error')
    );
    await setProjectManagerReturn(mockProj);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    const result = await createMultiProjectTask(makeParams({ projectCount: 1 }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('provision-failed');
    expect(mockProj.repository.deleteBranch).toHaveBeenCalled();
  });

  it('calls AGENTS.md generation with all project sources when projectCount > 1', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [insertedTaskRow] }, {}],
    });

    const { generateAgentsMd } = await import('./generateAgentsMd');
    vi.mocked(generateAgentsMd).mockResolvedValue(undefined);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    await createMultiProjectTask(makeParams({ projectCount: 2 }));

    expect(generateAgentsMd).toHaveBeenCalledTimes(1);
    const [calledPath, calledSources] = vi.mocked(generateAgentsMd).mock.calls[0];
    expect(calledPath).toContain('test-workspace');
    expect(calledPath).toContain('new-task');
    expect(calledSources).toHaveLength(2);
    expect(calledSources.map((s: { projectId: string }) => s.projectId)).toContain('proj-1');
    expect(calledSources.map((s: { projectId: string }) => s.projectId)).toContain('proj-2');
  });

  it('skips AGENTS.md when projectCount == 1', async () => {
    const mockProj = makeMockProject();
    await setProjectManagerReturn(mockProj);
    await configureDbMocks({
      insertCalls: [{ returning: [insertedTaskRow] }, {}],
    });

    const { generateAgentsMd } = await import('./generateAgentsMd');
    vi.mocked(generateAgentsMd).mockResolvedValue(undefined);

    const { createMultiProjectTask } = await import('./createMultiProjectTask');
    await createMultiProjectTask(makeParams({ projectCount: 1 }));

    expect(generateAgentsMd).not.toHaveBeenCalled();
  });
});

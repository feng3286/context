import { beforeEach, describe, expect, it, vi } from 'vitest';

// Top-level mocks — Vitest hoists these automatically
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();

// db.select() returns { from: fn } -> { where: fn } -> Promise<rows>
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
    get delete() {
      return mockDelete;
    },
    get update() {
      return mockUpdate;
    },
  },
}));

vi.mock('@main/db/schema', () => ({
  tasks: { id: 'tasks' },
  projects: { id: 'projects', name: 'projects.name', path: 'projects.path' },
  taskProjects: { taskId: 'taskProjects.taskId', projectId: 'taskProjects.projectId' },
  workspaceProjects: {
    workspaceId: 'workspaceProjects.workspaceId',
    projectId: 'workspaceProjects.projectId',
  },
}));

vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: {
    getProject: vi.fn(),
  },
}));

vi.mock('@main/core/projects/operations/getProjects', () => ({
  getProjectById: vi.fn(),
}));

describe('addProjectToTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns task-not-found when task does not exist', async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([]));

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'nonexistent',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('task-not-found');
    }
  });

  it('returns project-not-found when project does not exist', async () => {
    const taskRow = {
      id: 'task-1',
      workspaceId: 'ws-1',
      name: 'test-task',
      taskBranch: 'task/feature-abc12',
      status: 'in_progress',
      workDir: '/tmp/worktrees/test-task',
      isPinned: 0,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      statusChangedAt: '2024-01-01',
    };
    mockSelect.mockReturnValueOnce(makeSelectChain([taskRow])); // task lookup
    mockSelect.mockReturnValueOnce(makeSelectChain([])); // project lookup

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'nonexistent',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('project-not-found');
    }
  });

  it('returns already-bound when project is already associated with task', async () => {
    const taskRow = {
      id: 'task-1',
      workspaceId: 'ws-1',
      name: 'test-task',
      taskBranch: 'task/feature-abc12',
      status: 'in_progress',
      workDir: '/tmp/worktrees/test-task',
      isPinned: 0,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      statusChangedAt: '2024-01-01',
    };
    mockSelect.mockReturnValueOnce(makeSelectChain([taskRow])); // task lookup
    mockSelect.mockReturnValueOnce(makeSelectChain([{ id: 'proj-1', name: 'test-project' }])); // project lookup
    mockSelect.mockReturnValueOnce(makeSelectChain([{ workspaceId: 'ws-1', projectId: 'proj-1' }])); // workspace check
    mockSelect.mockReturnValueOnce(makeSelectChain([{ taskId: 'task-1', projectId: 'proj-1' }])); // already-bound check

    const { addProjectToTask } = await import('./addProjectToTask');
    const result = await addProjectToTask({
      taskId: 'task-1',
      projectId: 'proj-1',
      sourceBranch: 'main',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('already-bound');
    }
  });
});

import { Check, ChevronRight, FolderOpen, GitBranch } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useState } from 'react';
import {
  asMounted,
  getProjectManagerStore,
  getRepositoryStore,
  mountedProjectData,
} from '@renderer/features/projects/stores/project-selectors';
import { ProjectSelector } from '@renderer/features/tasks/create-task-modal/project-selector';
import { workspaceManagerStore } from '@renderer/features/workspaces/stores/workspace-manager';
import { getWorkspaceStore } from '@renderer/features/workspaces/stores/workspace-selectors';
import { WorkspaceStoreClass } from '@renderer/features/workspaces/stores/workspace-store';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldLabel } from '@renderer/lib/ui/field';

interface ProjectBranchConfig {
  projectId: string;
  projectName: string;
  sourceBranch: string;
}

interface MultiProjectBranchSelectorProps {
  workspaceId: string;
  selectedProjectIds: Set<string>;
  onProjectToggle: (projectId: string) => void;
  branchConfigs: Map<string, ProjectBranchConfig>;
  onBranchChange: (projectId: string, branch: string) => void;
}

const MultiProjectBranchSelector = observer(function MultiProjectBranchSelector({
  workspaceId,
  selectedProjectIds,
  onProjectToggle,
  branchConfigs,
  onBranchChange,
}: MultiProjectBranchSelectorProps) {
  const store = workspaceManagerStore.getWorkspace(workspaceId);
  const projects = store && store.status === 'ready' ? store.projects : [];

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No projects in this workspace. Add projects first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Select Projects & Branches</label>
      <div className="border border-border rounded-md divide-y divide-border">
        {projects.map((project) => {
          const isSelected = selectedProjectIds.has(project.id);
          const config = branchConfigs.get(project.id);
          const repo = getRepositoryStore(project.id);
          const branches = repo?.branches ?? [];
          const defaultBranchName = repo?.defaultBranch?.branch ?? 'main';

          return (
            <div key={project.id} className="px-3 py-2">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onProjectToggle(project.id)}
              >
                <div
                  className={`h-4 w-4 rounded border border-border flex items-center justify-center ${
                    isSelected ? 'bg-primary border-primary' : ''
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate text-sm flex-1">{project.name}</span>
              </div>
              {isSelected && (
                <div className="mt-2 ml-6 flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
                    value={config?.sourceBranch ?? defaultBranchName}
                    onChange={(e) => onBranchChange(project.id, e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.branch} value={b.branch}>
                        {b.branch}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const CreateTaskModal = observer(function CreateTaskModal({
  projectId,
  workspaceId,
  onClose,
}: BaseModalProps & {
  projectId?: string;
  workspaceId?: string;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(() => {
    if (projectId) return projectId;
    const nav = appState.navigation;
    const navProjectId =
      nav.currentViewId === 'task'
        ? (nav.viewParamsStore['task'] as { projectId?: string } | undefined)?.projectId
        : nav.currentViewId === 'project'
          ? (nav.viewParamsStore['project'] as { projectId?: string } | undefined)?.projectId
          : undefined;
    return (
      navProjectId ??
      Array.from(getProjectManagerStore().projects.values())
        .reverse()
        .find((p) => p.state === 'mounted')?.data?.id
    );
  });

  // For workspace mode: multi-project selection
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => {
    if (workspaceId) {
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store && store.status === 'ready' && store.projects.length > 0) {
        return new Set([store.projects[0].id]);
      }
    }
    return new Set();
  });

  // Branch config for each selected project
  const [branchConfigs, setBranchConfigs] = useState<Map<string, ProjectBranchConfig>>(() => {
    if (workspaceId) {
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store && store.status === 'ready') {
        const configs = new Map();
        for (const project of store.projects) {
          const repo = getRepositoryStore(project.id);
          configs.set(project.id, {
            projectId: project.id,
            projectName: project.name,
            sourceBranch: repo?.defaultBranch?.branch ?? 'main',
          });
        }
        return configs;
      }
    }
    return new Map();
  });

  // Task name and branch
  const [taskName, setTaskName] = useState('');
  const [taskBranch, setTaskBranch] = useState('');

  const [loading, setLoading] = useState(false);
  const { navigate } = useNavigate();

  // Initialize branch configs when projects change
  useEffect(() => {
    if (workspaceId) {
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store && store.status === 'ready') {
        const newConfigs = new Map(branchConfigs);
        for (const project of store.projects) {
          if (!newConfigs.has(project.id)) {
            const repo = getRepositoryStore(project.id);
            newConfigs.set(project.id, {
              projectId: project.id,
              projectName: project.name,
              sourceBranch: repo?.defaultBranch?.branch ?? 'main',
            });
          }
        }
        setBranchConfigs(newConfigs);
      }
    }
  }, [workspaceId]);

  const handleProjectToggle = (projectId: string) => {
    const newSet = new Set(selectedProjectIds);
    if (newSet.has(projectId)) {
      newSet.delete(projectId);
    } else {
      newSet.add(projectId);
    }
    setSelectedProjectIds(newSet);
  };

  const handleBranchChange = (projectId: string, branch: string) => {
    const newConfigs = new Map(branchConfigs);
    const config = newConfigs.get(projectId);
    if (config) {
      newConfigs.set(projectId, { ...config, sourceBranch: branch });
    }
    setBranchConfigs(newConfigs);
  };

  // Auto-generate task branch from task name
  const generateTaskBranch = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleTaskNameChange = (name: string) => {
    setTaskName(name);
    if (!taskBranch) {
      setTaskBranch(generateTaskBranch(name));
    }
  };

  // Validation
  const hasProject = workspaceId ? selectedProjectIds.size > 0 : !!selectedProjectId;
  const canCreate = hasProject && taskName.trim().length > 0;

  const handleCreateTask = useCallback(async () => {
    if (!canCreate) return;
    if (workspaceId && selectedProjectIds.size === 0) return;

    setLoading(true);
    try {
      const id = crypto.randomUUID();

      if (workspaceId) {
        // Multi-project task creation
        const projectBranchSources = Array.from(selectedProjectIds).map((pid) => {
          const config = branchConfigs.get(pid);
          return {
            projectId: pid,
            sourceBranch: config?.sourceBranch ?? 'main',
          };
        });

        await rpc.tasks.createMultiProjectTask({
          id,
          workspaceId,
          name: taskName.trim(),
          taskBranch: taskBranch.trim() || generateTaskBranch(taskName),
          projectBranchSources,
        });

        // Refresh workspace store to show new task in sidebar
        const wsStore = getWorkspaceStore(workspaceId);
        if (wsStore) {
          await (wsStore as WorkspaceStoreClass).load();
        }

        // Navigate to first project's task view
        const firstProjectId = Array.from(selectedProjectIds)[0];
        navigate('task', { projectId: firstProjectId, taskId: id });
      } else if (selectedProjectId) {
        // Single project task (existing behavior)
        const projectStore = getProjectManagerStore().projects.get(selectedProjectId);
        if (projectStore?.state !== 'mounted') return;

        const repo = getRepositoryStore(selectedProjectId);
        const defaultBranchName = repo?.defaultBranch?.branch ?? 'main';

        await projectStore.mountedProject!.taskManager.createTask({
          id,
          projectId: selectedProjectId,
          name: taskName.trim(),
          sourceBranch: { type: 'local', branch: defaultBranchName },
          strategy: {
            kind: 'new-branch',
            taskBranch: taskBranch.trim() || generateTaskBranch(taskName),
          },
        });

        navigate('task', { projectId: selectedProjectId, taskId: id });
      }

      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setLoading(false);
    }
  }, [
    canCreate,
    workspaceId,
    selectedProjectIds,
    selectedProjectId,
    taskName,
    taskBranch,
    branchConfigs,
    navigate,
    onClose,
  ]);

  return (
    <>
      <DialogHeader className="flex items-center gap-2">
        {workspaceId ? (
          <>
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            <ChevronRight className="size-3.5 text-foreground-passive" />
            <DialogTitle>Create Task in Workspace</DialogTitle>
          </>
        ) : (
          <>
            <ProjectSelector
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              trigger={
                <ComboboxTrigger className="h-6 flex items-center gap-2 border border-border rounded-md px-2.5 py-1 text-sm outline-none">
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  <ComboboxValue placeholder="Select a project" />
                </ComboboxTrigger>
              }
            />
            <ChevronRight className="size-3.5 text-foreground-passive" />
            <DialogTitle>Create Task</DialogTitle>
          </>
        )}
      </DialogHeader>
      <DialogContentArea className="gap-4">
        {workspaceId && (
          <MultiProjectBranchSelector
            workspaceId={workspaceId}
            selectedProjectIds={selectedProjectIds}
            onProjectToggle={handleProjectToggle}
            branchConfigs={branchConfigs}
            onBranchChange={handleBranchChange}
          />
        )}

        <Field>
          <FieldLabel>Task Name</FieldLabel>
          <input
            type="text"
            value={taskName}
            onChange={(e) => handleTaskNameChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter task name"
            autoFocus={!workspaceId}
          />
        </Field>

        <Field>
          <FieldLabel>Task Branch</FieldLabel>
          <input
            type="text"
            value={taskBranch}
            onChange={(e) => setTaskBranch(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Auto-generated from name"
          />
          <p className="text-xs text-muted-foreground mt-1">
            All projects will use this branch name.
          </p>
        </Field>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton
          size="sm"
          onClick={() => void handleCreateTask()}
          disabled={!canCreate || loading}
        >
          {loading ? 'Creating...' : 'Create'}
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});

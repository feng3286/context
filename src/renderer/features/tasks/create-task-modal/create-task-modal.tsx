import type { TFunction } from 'i18next';
import { Check, ChevronRight, FolderOpen, GitBranch } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Branch } from '@shared/git';
import type { CreateTaskError } from '@shared/tasks';
import { BranchSelector } from '@renderer/lib/components/branch-selector';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { getRepositoryStore } from '@renderer/features/projects/stores/project-selectors';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { getTaskManagerStore } from '@renderer/features/tasks/stores/task-selectors';
import { workspaceManagerStore } from '@renderer/features/workspaces/stores/workspace-manager';
import { getWorkspaceStore } from '@renderer/features/workspaces/stores/workspace-selectors';
import { WorkspaceStoreClass } from '@renderer/features/workspaces/stores/workspace-store';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
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

interface ProjectBranchSelectorProps {
  workspaceId: string;
  selectedProjectIds: Set<string>;
  onProjectToggle: (projectId: string) => void;
  branchConfigs: Map<string, ProjectBranchConfig>;
  onBranchChange: (projectId: string, branch: string) => void;
}

function formatCreateTaskError(
  err: CreateTaskError,
  t: TFunction
): { title: string; detail?: string } {
  switch (err.type) {
    case 'project-not-found':
      return {
        title: t('createTaskError:projectNotFound.title'),
        detail: t('createTaskError:projectNotFound.detail'),
      };
    case 'initial-commit-required':
      return {
        title: t('createTaskError:initialCommitRequired.title'),
        detail: t('createTaskError:initialCommitRequired.detail', { branch: err.branch }),
      };
    case 'branch-create-failed':
      return {
        title: t('createTaskError:branchCreateFailed.title'),
        detail: t('createTaskError:branchCreateFailed.detail', {
          branch: err.branch,
          error: err.error,
        }),
      };
    case 'provision-failed': {
      const msg = err.message;
      if (msg.includes('worktree')) {
        return {
          title: t('createTaskError:worktreeSetupFailed.title'),
          detail: t('createTaskError:worktreeSetupFailed.detail', { message: msg }),
        };
      }
      if (msg.includes('branch') && msg.includes('not found')) {
        return {
          title: t('createTaskError:branchNotFound.title'),
          detail: t('createTaskError:branchNotFound.detail', { message: msg }),
        };
      }
      if (msg.includes('already exists')) {
        return {
          title: t('createTaskError:worktreeAlreadyExists.title'),
          detail: t('createTaskError:worktreeAlreadyExists.detail', { message: msg }),
        };
      }
      if (msg.includes('ENOENT') || msg.includes('no such file')) {
        return {
          title: t('createTaskError:pathNotFound.title'),
          detail: t('createTaskError:pathNotFound.detail', { message: msg }),
        };
      }
      if (msg.includes('EACCES') || msg.includes('permission')) {
        return {
          title: t('createTaskError:permissionDenied.title'),
          detail: t('createTaskError:permissionDenied.detail', { message: msg }),
        };
      }
      return {
        title: t('createTaskError:generic.title'),
        detail: t('createTaskError:generic.detail', { message: msg }),
      };
    }
  }
}

interface ProjectBranchRowProps {
  project: { id: string; name: string };
  isSelected: boolean;
  config: ProjectBranchConfig | undefined;
  repo: ReturnType<typeof getRepositoryStore>;
  onProjectToggle: (projectId: string) => void;
  onBranchChange: (projectId: string, branch: string) => void;
}

const ProjectBranchRow = observer(function ProjectBranchRow({
  project,
  isSelected,
  config,
  repo,
  onProjectToggle,
  onBranchChange,
}: ProjectBranchRowProps) {
  const branches = repo?.branches ?? [];
  const defaultBranchName = repo?.defaultBranch?.branch ?? 'main';

  // Find the Branch object matching the currently selected sourceBranch string
  const selectedBranch: Branch | undefined = useMemo(
    () => branches.find((b) => b.branch === (config?.sourceBranch ?? defaultBranchName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, config?.sourceBranch, defaultBranchName]
  );

  return (
    <div className="px-3 py-2">
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
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <BranchSelector
              branches={branches}
              value={selectedBranch}
              onValueChange={(b: Branch) => onBranchChange(project.id, b.branch)}
              onRefresh={() => repo?.refresh()}
              isRefreshing={repo?.loading ?? false}
              trigger={
                <ComboboxTrigger className="min-w-[240px] border flex border-border h-9 hover:bg-muted/30 rounded-md px-2.5 py-1 text-left text-sm outline-none items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                    <ComboboxValue placeholder="Select a branch" />
                  </div>
                </ComboboxTrigger>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
});

const ProjectBranchSelector = observer(function ProjectBranchSelector({
  workspaceId,
  selectedProjectIds,
  onProjectToggle,
  branchConfigs,
  onBranchChange,
}: ProjectBranchSelectorProps) {
  const { t } = useTranslation();
  const store = workspaceManagerStore.getWorkspace(workspaceId);
  const projects = store && store.status === 'ready' ? store.projects : [];

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('addProject:noProjectsInWorkspace')}</p>;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{t('createTask:selectProjectsBranches')}</label>
      <div className="border border-border rounded-md divide-y divide-border">
        {projects.map((project) => (
          <ProjectBranchRow
            key={project.id}
            project={project}
            isSelected={selectedProjectIds.has(project.id)}
            config={branchConfigs.get(project.id)}
            repo={getRepositoryStore(project.id)}
            onProjectToggle={onProjectToggle}
            onBranchChange={onBranchChange}
          />
        ))}
      </div>
    </div>
  );
});

export const CreateTaskModal = observer(function CreateTaskModal({
  workspaceId,
  onClose,
}: BaseModalProps & {
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => {
    const store = workspaceManagerStore.getWorkspace(workspaceId);
    if (store && store.status === 'ready' && store.projects.length > 0) {
      return new Set([store.projects[0].id]);
    }
    return new Set();
  });

  // Branch config for each selected project
  const [branchConfigs, setBranchConfigs] = useState<Map<string, ProjectBranchConfig>>(() => {
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
    return new Map();
  });

  // Task name and branch
  const [taskName, setTaskName] = useState('');
  const [taskBranch, setTaskBranch] = useState('');
  const [branchManuallyEdited, setBranchManuallyEdited] = useState(false);
  const [pushBranch, setPushBranch] = useState(false);
  const [createBranch, setCreateBranch] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { navigate } = useNavigate();

  // Get branchPrefix setting for preview
  const { value: localProjectSettings } = useAppSettingsKey('localProject');
  const branchPrefix = localProjectSettings?.branchPrefix ?? '';

  // Generate preview suffix (matches backend logic)
  const previewSuffix = useMemo(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }, []); // Fixed on mount to simulate backend behavior

  // Initialize branch configs when projects change
  useEffect(() => {
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
    setError(null);
    if (!branchManuallyEdited) {
      setTaskBranch(generateTaskBranch(name));
    }
  };

  // Validation
  const canCreate = selectedProjectIds.size > 0 && taskName.trim().length > 0;

  // Compute preview branch name
  const rawBranchPreview = taskBranch.trim() || generateTaskBranch(taskName);
  const previewBranchName = useMemo(() => {
    if (!rawBranchPreview) return '';
    return branchPrefix
      ? `${branchPrefix}/${rawBranchPreview}-${previewSuffix}`
      : `${rawBranchPreview}-${previewSuffix}`;
  }, [rawBranchPreview, branchPrefix, previewSuffix]);

  const handleCreateTask = useCallback(async () => {
    if (!canCreate) return;

    setLoading(true);
    try {
      const id = crypto.randomUUID();

      const projectBranchSources = Array.from(selectedProjectIds).map((pid) => {
        const config = branchConfigs.get(pid);
        return {
          projectId: pid,
          sourceBranch: config?.sourceBranch ?? 'main',
        };
      });

      const result = await rpc.tasks.createMultiProjectTask({
        id,
        workspaceId,
        name: taskName.trim(),
        taskBranch: taskBranch.trim() || generateTaskBranch(taskName),
        pushBranch: pushBranch || undefined,
        createBranch,
        projectBranchSources,
      });

      if (!result.success) {
        const formatted = formatCreateTaskError(result.error, t);
        setError(formatted.detail ? `${formatted.title}: ${formatted.detail}` : formatted.title);
        return;
      }

      // Refresh workspace store to show new task in sidebar
      const wsStore = getWorkspaceStore(workspaceId);
      if (wsStore) {
        await (wsStore as WorkspaceStoreClass).load();
      }

      // Refresh TaskManagerStore for each project so navigation finds the new task
      for (const pid of selectedProjectIds) {
        const taskManager = getTaskManagerStore(pid);
        if (taskManager) {
          await taskManager.reloadTasks();
        }
      }

      // Navigate to first project's task view
      const firstProjectId = Array.from(selectedProjectIds)[0];
      navigate('task', { projectId: firstProjectId, taskId: id });

      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
      const message = err instanceof Error ? err.message : String(err);
      const innerMatch = message.match(/Failed to provision task: (.+)/);
      const innerMessage = innerMatch ? innerMatch[1] : message;
      setError(`${t('createTaskError:generic.title')}: ${innerMessage}`);
    } finally {
      setLoading(false);
    }
  }, [
    canCreate,
    workspaceId,
    selectedProjectIds,
    taskName,
    taskBranch,
    pushBranch,
    createBranch,
    branchConfigs,
    navigate,
    onClose,
  ]);

  return (
    <>
      <DialogHeader className="flex items-center gap-2">
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        <ChevronRight className="size-3.5 text-foreground-passive" />
        <DialogTitle>{t('createTask:title')}</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="gap-4">
        <ProjectBranchSelector
          workspaceId={workspaceId}
          selectedProjectIds={selectedProjectIds}
          onProjectToggle={handleProjectToggle}
          branchConfigs={branchConfigs}
          onBranchChange={handleBranchChange}
        />

        <Field>
          <FieldLabel>{t('createTask:taskName')}</FieldLabel>
          <input
            type="text"
            value={taskName}
            onChange={(e) => handleTaskNameChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('createTask:taskNamePlaceholder')}
            autoFocus
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={createBranch}
            onChange={(e) => setCreateBranch(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm">{t('createTask:createBranch')}</span>
        </label>

        {createBranch && (
          <>
            <Field>
              <FieldLabel>{t('createTask:taskBranch')}</FieldLabel>
              <input
                type="text"
                value={taskBranch}
                onChange={(e) => {
                  setTaskBranch(e.target.value);
                  setBranchManuallyEdited(true);
                }}
                className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('createTask:taskBranchPlaceholder')}
              />
              {previewBranchName && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('createTask:finalBranch')}{' '}
                  <code className="rounded bg-muted/60 px-1">{previewBranchName}</code>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t('createTask:allProjectsUseBranch')}
              </p>
            </Field>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pushBranch}
                onChange={(e) => setPushBranch(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm">{t('createTask:pushBranch')}</span>
            </label>
          </>
        )}
      </DialogContentArea>
      <DialogFooter>
        {error && (
          <div className="flex-1 min-w-0 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-xs font-medium text-destructive truncate">{error}</p>
          </div>
        )}
        <ConfirmButton
          size="sm"
          onClick={() => void handleCreateTask()}
          disabled={!canCreate || loading}
        >
          {loading ? t('createTask:creating') : t('createTask:create')}
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});

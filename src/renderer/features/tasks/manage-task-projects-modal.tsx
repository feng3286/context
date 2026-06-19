import { AlertTriangle, ChevronDown, Files, GitBranch, Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRepositoryStore } from '@renderer/features/projects/stores/project-selectors';
import { isProvisioned } from '@renderer/features/tasks/stores/task';
import { getTaskManagerStore } from '@renderer/features/tasks/stores/task-selectors';
import { workspaceManagerStore } from '@renderer/features/workspaces/stores/workspace-manager';
import { getWorkspaceStore } from '@renderer/features/workspaces/stores/workspace-selectors';
import { WorkspaceStoreClass } from '@renderer/features/workspaces/stores/workspace-store';
import { rpc } from '@renderer/lib/ipc';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { MicroLabel } from '@renderer/lib/ui/label';
import { ScrollArea } from '@renderer/lib/ui/scroll-area';

interface BoundProject {
  projectId: string;
  projectName: string;
  sourceBranch: string | null;
  taskBranch: string | null;
}

interface AvailableProject {
  projectId: string;
  projectName: string;
  defaultBranch: string;
  selected: boolean;
  sourceBranch: string;
}

type Props = BaseModalProps<void> & {
  taskId: string;
  projectId: string;
};

export const ManageTaskProjectsModal = observer(function ManageTaskProjectsModal({
  taskId,
  projectId,
  onSuccess,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [boundProjects, setBoundProjects] = useState<BoundProject[]>([]);
  const [availableProjects, setAvailableProjects] = useState<AvailableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const taskManager = getTaskManagerStore(projectId);
        const taskStore = taskManager?.tasks.get(taskId);
        if (!taskStore || !isProvisioned(taskStore)) {
          setLoading(false);
          return;
        }

        const taskData = taskStore.data;
        const wsId = taskData.workspaceId;
        setWorkspaceId(wsId);

        const contexts = await rpc.tasks.getTaskProjectContexts(taskId);
        const bound: BoundProject[] = contexts.map((ctx) => ({
          projectId: ctx.projectId,
          projectName: ctx.projectName,
          sourceBranch: ctx.sourceBranch,
          taskBranch: taskData.taskBranch ?? null,
        }));

        if (!cancelled) {
          setBoundProjects(bound);

          const workspaceStore = workspaceManagerStore.getWorkspace(wsId);
          if (workspaceStore && workspaceStore.status === 'ready') {
            const boundIds = new Set(bound.map((p) => p.projectId));
            const available: AvailableProject[] = workspaceStore.projects
              .filter((p) => !boundIds.has(p.id))
              .map((p) => {
                const repo = getRepositoryStore(p.id);
                return {
                  projectId: p.id,
                  projectName: p.name,
                  defaultBranch: repo?.defaultBranch?.branch ?? 'main',
                  selected: false,
                  sourceBranch: repo?.defaultBranch?.branch ?? 'main',
                };
              });
            setAvailableProjects(available);
          }
        }
      } catch (e) {
        console.error('Failed to load task projects:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [taskId, projectId]);

  const handleToggleAvailable = useCallback((projectId: string) => {
    setAvailableProjects((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const handleBranchChange = useCallback((projectId: string, branch: string) => {
    setAvailableProjects((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, sourceBranch: branch } : p))
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    const projectsToAdd = availableProjects.filter((p) => p.selected);

    try {
      for (const project of projectsToAdd) {
        const result = await rpc.tasks.addProjectToTask({
          taskId,
          projectId: project.projectId,
          sourceBranch: project.sourceBranch,
          pushBranch: false,
        });

        if (!result.success) {
          const errType = result.error.type;
          throw new Error(
            errType === 'already-bound'
              ? t('manageTaskProjects:alreadyBound', { project: project.projectName })
              : errType === 'branch-create-failed'
                ? (result.error as { error: string }).error
                : errType === 'provision-failed'
                  ? ((result.error as { message?: string }).message ??
                    t('manageTaskProjects:provisionFailed', { project: project.projectName }))
                  : errType === 'db-error'
                    ? (result.error as { message: string }).message
                    : t('manageTaskProjects:addFailed', { project: project.projectName })
          );
        }
      }

      if (projectsToAdd.length > 0) {
        const taskBranch = boundProjects[0]?.taskBranch ?? null;
        const newBound = projectsToAdd.map((p) => ({
          projectId: p.projectId,
          projectName: p.projectName,
          sourceBranch: p.sourceBranch,
          taskBranch,
        }));
        setBoundProjects((prev) => [...prev, ...newBound]);
        const addedIds = new Set(projectsToAdd.map((p) => p.projectId));
        setAvailableProjects((prev) => prev.filter((p) => !addedIds.has(p.projectId)));
      }

      setAvailableProjects((prev) => prev.map((p) => ({ ...p, selected: false })));
      setShowAddSection(false);

      // Refresh stores
      const taskManager = getTaskManagerStore(projectId);
      if (taskManager) {
        await taskManager.reloadTasks();
      }
      if (workspaceId) {
        const wsStore = getWorkspaceStore(workspaceId);
        if (wsStore && wsStore.status === 'ready') {
          await (wsStore as WorkspaceStoreClass).load();
        }
      }

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }, [availableProjects, boundProjects, taskId, projectId, workspaceId, t, onSuccess]);

  const canSave = !saving && availableProjects.some((p) => p.selected);

  if (loading) {
    return (
      <>
        <DialogHeader showCloseButton={false}>
          <DialogTitle>{t('manageTaskProjects:title')}</DialogTitle>
        </DialogHeader>
        <DialogContentArea className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </DialogContentArea>
      </>
    );
  }

  return (
    <>
      <DialogHeader showCloseButton={false}>
        <DialogTitle>{t('manageTaskProjects:title')}</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="gap-4">
        <div className="flex flex-col gap-2">
          <MicroLabel className="text-foreground-passive">
            {t('manageTaskProjects:boundProjects', { count: boundProjects.length })}
          </MicroLabel>
          <ScrollArea className="max-h-48">
            <div className="flex flex-col gap-1">
              {boundProjects.map((project) => (
                <div
                  key={project.projectId}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Files className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate">{project.projectName}</span>
                    {project.sourceBranch && (
                      <div className="flex items-center gap-1 text-xs text-foreground-passive">
                        <GitBranch className="size-3" />
                        <span>
                          {project.sourceBranch} → {project.taskBranch}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAddSection(!showAddSection)}
          >
            <Files className="size-3.5 mr-2" />
            {showAddSection ? t('manageTaskProjects:hideAdd') : t('manageTaskProjects:addProject')}
            <ChevronDown
              className={`size-3.5 ml-2 transition-transform ${showAddSection ? 'rotate-180' : ''}`}
            />
          </Button>

          {showAddSection && availableProjects.length > 0 && (
            <ScrollArea className="max-h-48">
              <div className="flex flex-col gap-1 border border-border rounded-md divide-y divide-border">
                {availableProjects.map((project) => (
                  <div key={project.projectId} className="px-3 py-2">
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleToggleAvailable(project.projectId)}
                    >
                      <div
                        className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                          project.selected ? 'bg-primary border-primary' : 'border-border'
                        }`}
                      >
                        {project.selected && (
                          <svg
                            className="h-3 w-3 text-primary-foreground"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate text-sm flex-1">{project.projectName}</span>
                    </div>
                    {project.selected && (
                      <div className="mt-2 ml-6 flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        <select
                          className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
                          value={project.sourceBranch}
                          onChange={(e) => handleBranchChange(project.projectId, e.target.value)}
                        >
                          {(() => {
                            const repo = getRepositoryStore(project.projectId);
                            const branches = repo?.branches ?? [];
                            return branches.map((b) => (
                              <option key={b.branch} value={b.branch}>
                                {b.branch}
                              </option>
                            ));
                          })()}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {showAddSection && availableProjects.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('manageTaskProjects:noAvailableProjects')}
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}
      </DialogContentArea>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {t('common:cancel')}
        </Button>
        <Button onClick={() => void handleSave()} disabled={!canSave}>
          {saving ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {t('manageTaskProjects:saving')}
            </>
          ) : (
            t('common:save')
          )}
        </Button>
      </DialogFooter>
    </>
  );
});

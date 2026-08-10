import { ChevronDown, ChevronRight, Layers, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@shared/tasks';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import {
  SidebarItemMiniButton,
  SidebarMenuRow,
} from '@renderer/features/sidebar/sidebar-primitives';
import { rpc } from '@renderer/lib/ipc';
import {
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { debugLog } from '@renderer/utils/debug-logger';
import { workspaceManagerStore } from '../stores/workspace-manager';
import { WorkspaceStoreClass } from '../stores/workspace-store';

function WorkspaceHeaderRow({
  store,
  isExpanded,
  isActive,
  onToggleExpand,
  onNavigate,
  onDelete,
}: {
  store: { data: { id: string; name: string }; status: string };
  isExpanded: boolean;
  isActive: boolean;
  onToggleExpand: () => void;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SidebarMenuRow
      isActive={isActive}
      className="group/workspace pr-1.5 pl-2 h-9 gap-1.5 border-b border-border/30 mb-0.5"
    >
      <button
        className="p-0.5 shrink-0 rounded hover:bg-background-tertiary-2 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-foreground-tertiary-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-foreground-tertiary-muted" />
        )}
      </button>
      <Layers className="h-4 w-4 shrink-0 text-foreground-tertiary-muted" />
      <span
        className="truncate flex-1 cursor-pointer hover:text-foreground-tertiary transition-colors"
        onClick={onNavigate}
      >
        {store.data.name}
      </span>
      <SidebarItemMiniButton
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={t('workspaces:deleteWorkspace')}
        className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </SidebarItemMiniButton>
    </SidebarMenuRow>
  );
}

function TaskSidebarRow({
  task,
  isActive,
  onClick,
  onDelete,
}: {
  task: Task;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SidebarMenuRow
      isActive={isActive}
      className="group/task pl-3 pr-1.5 h-7 gap-1.5 rounded-md mx-0.5"
      onClick={() => onClick()}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-foreground-tertiary-muted" />
      <span className="truncate flex-1">{task.name}</span>
      <Badge variant="secondary" className="text-[10px] px-1 h-4 shrink-0">
        {task.status}
      </Badge>
      <SidebarItemMiniButton
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={t('workspaces:deleteTask')}
        className="opacity-0 group-hover/task:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3 w-3" />
      </SidebarItemMiniButton>
    </SidebarMenuRow>
  );
}

export const WorkspaceSidebarList = observer(function WorkspaceSidebarList() {
  const { t } = useTranslation();
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { params } = useParams('workspace');
  const taskParams = useParams('task');
  const showCreateTaskModal = useShowModal('taskModal');

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

  useEffect(() => {
    workspaceManagerStore.load();
  }, []);

  const workspaces = Array.from(workspaceManagerStore.workspaces.values());
  const activeWorkspaceId = currentView === 'workspace' ? params.workspaceId : null;

  const toggleExpand = (workspaceId: string) => {
    const newSet = new Set(expandedWorkspaces);
    if (newSet.has(workspaceId)) {
      newSet.delete(workspaceId);
    } else {
      newSet.add(workspaceId);
    }
    setExpandedWorkspaces(newSet);
    // Load projects when expanding
    const store = workspaceManagerStore.getWorkspace(workspaceId);
    if (store && store.status === 'unloaded') {
      (store as WorkspaceStoreClass).load();
    }
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    // Navigate to workspace detail view
    navigate('workspace', { workspaceId });
    // Also expand to show projects/tasks
    if (!expandedWorkspaces.has(workspaceId)) {
      toggleExpand(workspaceId);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (confirm(t('workspaces:deleteWorkspaceConfirmShort'))) {
      await workspaceManagerStore.deleteWorkspace(workspaceId);
    }
  };

  const handleTaskClick = async (task: Task, workspaceProjects: string[]) => {
    const projectManager = getProjectManagerStore();

    // Resolve the project that actually owns this task. The sidebar lists tasks
    // across the whole workspace, but a single-project task belongs to exactly
    // one of the workspace's projects — not necessarily workspaceProjects[0].
    // Navigating under the wrong projectId leaves the task view blank, because
    // getTaskStore(wrongProject, taskId) returns undefined → kind "missing".
    let targetProjectId: string | undefined;
    // 1. Prefer a workspace project that already has the task loaded (instant,
    //    covers re-visits where the task is already provisioned somewhere).
    for (const pid of workspaceProjects) {
      if (projectManager.projects.get(pid)?.mountedProject?.taskManager.tasks.get(task.id)) {
        targetProjectId = pid;
        break;
      }
    }
    // 2. Cold path: task not loaded anywhere yet — ask the backend for the task's
    //    project association.
    if (!targetProjectId) {
      try {
        const ctxs = await rpc.tasks.getTaskProjectContexts(task.id);
        targetProjectId =
          ctxs.find((c) => workspaceProjects.includes(c.projectId))?.projectId ??
          ctxs[0]?.projectId;
      } catch {
        /* ignore — fall through to the default below */
      }
    }
    // 3. Last resort: the workspace's first project.
    if (!targetProjectId) targetProjectId = workspaceProjects[0];
    if (!targetProjectId) return;

    // Ensure the project is loaded and mounted before navigating.
    if (!projectManager.projects.get(targetProjectId)) {
      await projectManager.load();
    }
    if (projectManager.projects.get(targetProjectId)) {
      await projectManager.mountProject(targetProjectId);
    }

    debugLog('workspace-sidebar', 'handleTaskClick navigate', {
      taskId: task.id,
      targetProjectId,
      triedFallback: !workspaceProjects.includes(targetProjectId),
    });
    // Navigate to task view under the task's actual project
    navigate('task', { projectId: targetProjectId, taskId: task.id });
  };

  const handleDeleteTask = async (workspaceId: string, task: Task) => {
    if (confirm(t('workspaces:deleteTaskConfirm', { name: task.name }))) {
      debugLog('workspace-sidebar', 'handleDeleteTask called', {
        workspaceId,
        taskId: task.id,
        taskName: task.name,
      });
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store) {
        await (store as WorkspaceStoreClass).deleteTask(task.id);
        debugLog('workspace-sidebar', 'handleDeleteTask: after delete, navigating to workspace');
        navigate('workspace', { workspaceId });
      }
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
      {workspaces.map((store) => {
        const isExpanded = expandedWorkspaces.has(store.data.id);
        const isActive = store.data.id === activeWorkspaceId;
        const projects = store.status === 'ready' ? store.projects : [];
        const tasks = store.status === 'ready' ? store.tasks : [];

        return (
          <div key={store.data.id} className="mb-1">
            {/* Workspace header row */}
            <WorkspaceHeaderRow
              store={store}
              isExpanded={isExpanded}
              isActive={isActive}
              onToggleExpand={() => toggleExpand(store.data.id)}
              onNavigate={() => handleWorkspaceClick(store.data.id)}
              onDelete={() => void handleDeleteWorkspace(store.data.id)}
            />

            {/* Expanded content: Tasks */}
            {isExpanded && (
              <div className="ml-3 mt-1.5 mb-2 space-y-2">
                {/* Tasks section */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between px-2 py-0.5 h-6">
                    <span className="text-xs font-medium text-foreground-tertiary-muted flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Tasks ({tasks.length})
                    </span>
                    <SidebarItemMiniButton
                      onClick={(e) => {
                        e.stopPropagation();
                        showCreateTaskModal({ workspaceId: store.data.id });
                      }}
                      title={t('workspaces:newTask')}
                      className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </SidebarItemMiniButton>
                  </div>
                  {tasks.length === 0 ? (
                    <div className="text-xs text-foreground-tertiary-muted px-3 py-1 opacity-60">
                      {t('workspaces:noTasks')}
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <TaskSidebarRow
                        key={task.id}
                        task={task}
                        isActive={currentView === 'task' && taskParams.params.taskId === task.id}
                        onClick={() =>
                          void handleTaskClick(
                            task,
                            projects.map((p) => p.id)
                          )
                        }
                        onDelete={() => void handleDeleteTask(store.data.id, task)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {workspaces.length === 0 && (
        <div className="text-xs text-foreground-tertiary-muted px-4 py-3 text-center opacity-60">
          {t('workspaces:noWorkspaces')}
        </div>
      )}
    </div>
  );
});

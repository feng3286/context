import { observer } from 'mobx-react-lite';
import { selectCurrentPr } from '@shared/pull-requests';
import { TaskSidebarAgentStatus } from '@renderer/features/sidebar/task-sidebar-agent-status';
import { TaskContextMenu } from '@renderer/features/tasks/components/task-context-menu';
import { TaskGitDiffStats } from '@renderer/features/tasks/components/task-git-diff-stats';
import { TaskStore } from '@renderer/features/tasks/stores/task';
import { getTaskManagerStore, getTaskStore } from '@renderer/features/tasks/stores/task-selectors';
import {
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { debugLog } from '@renderer/utils/debug-logger';
import { cn } from '@renderer/utils/utils';
import { PrBadge } from '../../lib/components/pr-badge';
import { workspaceManagerStore } from '../workspaces/stores/workspace-manager';
import { SidebarMenuRow } from './sidebar-primitives';

interface SidebarTaskItemProps {
  taskId: string;
  projectId: string;
  /** Pinned strip uses tighter padding than tasks nested under a project. */
  rowVariant?: 'underProject' | 'pinned';
}

export const SidebarTaskItem = observer(function SidebarTaskItem({
  taskId,
  projectId,
  rowVariant = 'underProject',
}: SidebarTaskItemProps) {
  const { navigate } = useNavigate();
  const showRename = useShowModal('renameTaskModal');
  const showConfirm = useShowModal('confirmActionModal');

  const { currentView } = useWorkspaceSlots();
  const { params } = useParams('task');
  const isActive =
    currentView === 'task' && params.taskId === taskId && params.projectId === projectId;

  const task = getTaskStore(projectId, taskId);
  if (!task) return null;
  const taskManager = getTaskManagerStore(projectId);

  const isBootstrapping =
    task.state === 'unregistered' ||
    (task.state === 'unprovisioned' &&
      (task.phase === 'provision' || task.phase === 'provision-error'));

  const taskName = task.data.name;

  const handleProvision = () => {
    if (task.state !== 'unprovisioned' || task.phase !== 'idle') return;
    taskManager?.openTask(taskId);
  };

  const handleWorkspaceNavigation = async () => {
    if (!isActive) {
      debugLog('task-item', 'handleWorkspaceNavigation: not active, skipping');
      return;
    }
    if (!('workspaceId' in task.data)) {
      debugLog('task-item', 'handleWorkspaceNavigation: no workspaceId in task.data');
      return;
    }
    const wsId = task.data.workspaceId;
    debugLog('task-item', 'handleWorkspaceNavigation: starting', { wsId });
    await workspaceManagerStore.load();
    const wsStore = workspaceManagerStore.getWorkspace(wsId);
    debugLog('task-item', 'handleWorkspaceNavigation: after load', {
      wsStoreExists: !!wsStore,
      wsStoreStatus: wsStore?.status,
      wsStoreProjects: wsStore?.projects.length,
    });
    if (wsStore && wsStore.status === 'unloaded') {
      debugLog('task-item', 'handleWorkspaceNavigation: loading specific workspace');
      await wsStore.load();
    }
    debugLog('task-item', 'handleWorkspaceNavigation: navigating', { wsId });
    navigate('workspace', { workspaceId: wsId });
  };

  const handleArchive = async () => {
    handleWorkspaceNavigation();
    void taskManager?.archiveTask(taskId);
  };

  const handleRename = () => showRename({ projectId, taskId, currentName: taskName });

  const handleDelete = () => {
    debugLog('task-item', 'handleDelete called', {
      taskId,
      projectId,
      isActive,
      currentView,
      paramsTaskId: params.taskId,
      paramsProjectId: params.projectId,
      taskName,
      hasWorkspaceId: 'workspaceId' in task.data,
      workspaceId: 'workspaceId' in task.data ? task.data.workspaceId : 'N/A',
    });
    showConfirm({
      title: 'Delete task',
      description: `"${taskName}" will be permanently deleted. This action cannot be undone.`,
      confirmLabel: 'Delete',
      onSuccess: async () => {
        debugLog('task-item', 'handleDelete.onSuccess called', { taskId });
        await handleWorkspaceNavigation();
        debugLog('task-item', 'calling deleteTask', { taskId });
        void taskManager?.deleteTask(taskId);
      },
    });
  };

  const canPin = task.state !== 'unregistered';

  return (
    <TaskContextMenu
      isPinned={task.data.isPinned}
      canPin={canPin}
      isArchived={false}
      onPin={() => void task.setPinned(true)}
      onUnpin={() => void task.setPinned(false)}
      onRename={handleRename}
      onArchive={handleArchive}
      onDelete={handleDelete}
    >
      <SidebarMenuRow
        className={cn(
          'group/row flex items-center justify-between px-1 h-8 gap-1',
          rowVariant === 'pinned' ? 'pl-2' : 'pl-8'
        )}
        isActive={isActive}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          handleProvision();
          navigate('task', { projectId, taskId });
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-hidden">
          <span
            className={cn(
              'min-w-0 truncate text-left transition-colors',
              isBootstrapping && 'text-foreground/40'
            )}
          >
            {taskName}
          </span>
          <TaskGitDiffStats task={task} className="h-full shrink-0 flex items-center pr-1" />
          <RenderPrBadge task={task} />
        </div>
        <TaskSidebarAgentStatus task={task} />
      </SidebarMenuRow>
    </TaskContextMenu>
  );
});

const RenderPrBadge = observer(function RenderPrBadge({ task }: { task: TaskStore }) {
  if (!('prs' in task.data)) return null;
  const pr = selectCurrentPr(task.data.prs);
  return pr ? <PrBadge variant="compact" pr={pr} /> : null;
});

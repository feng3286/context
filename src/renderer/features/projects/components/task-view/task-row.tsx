import { GitBranch, ListTodo, Pin } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { selectCurrentPr } from '@shared/pull-requests';
import { type Task, type TaskLifecycleStatus } from '@shared/tasks';
import { getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { AgentStatusIndicator } from '@renderer/features/tasks/components/agent-status-indicator';
import { TaskContextMenu } from '@renderer/features/tasks/components/task-context-menu';
import { TaskGitDiffStats } from '@renderer/features/tasks/components/task-git-diff-stats';
import { type TaskStore } from '@renderer/features/tasks/stores/task';
import {
  getTaskManagerStore,
  taskAgentStatus,
} from '@renderer/features/tasks/stores/task-selectors';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { PrBadge } from '@renderer/lib/components/pr-badge';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { agentConfig } from '@renderer/utils/agentConfig';
import { cn } from '@renderer/utils/utils';

export type ReadyTask = TaskStore & { data: Task };

const STATUS_COLORS: Record<TaskLifecycleStatus, string> = {
  todo: 'text-foreground-passive',
  in_progress: 'text-blue-500',
  review: 'text-amber-500',
  done: 'text-green-500',
  cancelled: 'text-red-500',
};

const STATUS_BADGE_VARIANT: Record<TaskLifecycleStatus, 'outline' | 'secondary'> = {
  todo: 'outline',
  in_progress: 'secondary',
  review: 'secondary',
  done: 'secondary',
  cancelled: 'outline',
};

export const TaskRow = observer(function TaskRow({
  task,
  projectId,
  isSelected,
  onToggleSelect,
}: {
  task: ReadyTask;
  projectId: string;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const { navigate } = useNavigate();
  const showRename = useShowModal('renameTaskModal');
  const taskManager = getTaskManagerStore(projectId);

  const currentBranch = task.data.taskBranch;

  const handleArchive = () => void taskManager?.archiveTask(task.data.id);
  const handleRestore = () => void taskManager?.restoreTask(task.data.id);
  const handleProvision = () => void taskManager?.provisionTask(task.data.id);
  const handleRename = () =>
    showRename({
      projectId,
      taskId: task.data.id,
      currentName: task.data.name,
    });

  const isArchived = Boolean(task.data.archivedAt);
  const canPin = task.state !== 'unregistered';
  const agentAttention = taskAgentStatus(task);
  const currentPr = task.data.prs ? selectCurrentPr(task.data.prs) : undefined;
  const prCount = task.data.prs?.length ?? 0;

  const statusColor = STATUS_COLORS[task.data.status] ?? 'text-foreground-muted';
  const badgeVariant = STATUS_BADGE_VARIANT[task.data.status] ?? 'outline';

  return (
    <TaskContextMenu
      isPinned={task.data.isPinned}
      canPin={canPin}
      isArchived={isArchived}
      onPin={() => void task.setPinned(true)}
      onUnpin={() => void task.setPinned(false)}
      onRename={handleRename}
      onArchive={handleArchive}
      onRestore={handleRestore}
    >
      <button
        onClick={() => {
          if (isArchived) return;
          handleProvision();
          navigate('task', { projectId, taskId: task.data.id });
        }}
        className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors text-left min-w-0 cursor-pointer"
      >
        {/* Left icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
          <ListTodo className="h-4 w-4 text-foreground-muted" />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {/* Row 1: name + status */}
          <div className="flex items-center gap-2 min-w-0">
            {task.data.isPinned && (
              <Pin className="h-3 w-3 text-foreground-passive shrink-0 rotate-45" />
            )}
            <span className="text-sm truncate flex-1">{task.data.name}</span>
            <Badge
              variant={badgeVariant}
              className={cn('text-[10px] px-1 h-4 shrink-0 font-normal', statusColor)}
            >
              {task.data.status === 'in_progress' ? 'in progress' : task.data.status}
            </Badge>
          </div>

          {/* Row 2: branch + PR + time */}
          <div className="flex items-center gap-2 text-xs text-foreground-passive min-w-0">
            {currentBranch && (
              <span className="flex items-center gap-1 shrink-0 truncate max-w-[80px]">
                <GitBranch className="h-3 w-3" />
                <span className="truncate">{currentBranch}</span>
              </span>
            )}
            {prCount > 0 && (
              <span className="shrink-0">
                {prCount} PR{prCount > 1 ? 's' : ''}
              </span>
            )}
            <TaskGitDiffStats task={task} className="text-xs shrink-0" />
            {currentPr && <PrBadge pr={currentPr} />}
            <span className="shrink-0 ml-auto font-mono">
              <RelativeTime
                value={task.data.lastInteractedAt ?? task.data.createdAt}
                className="text-[10px]"
                compact
              />
            </span>
          </div>
        </div>
      </button>
    </TaskContextMenu>
  );
});

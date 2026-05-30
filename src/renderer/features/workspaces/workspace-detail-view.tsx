import {
  FolderPlus,
  GitBranch,
  Layers,
  ListTodo,
  MoreVertical,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, type ReactNode } from 'react';
import type { Project } from '@shared/projects';
import type { Task, TaskLifecycleStatus } from '@shared/tasks';
import { SidebarItemMiniButton } from '@renderer/features/sidebar/sidebar-primitives';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { cn } from '@renderer/utils/utils';
import { workspaceManagerStore } from './stores/workspace-manager';
import { getWorkspaceStore } from './stores/workspace-selectors';
import { WorkspaceStoreClass } from './stores/workspace-store';

interface WorkspaceViewWrapperProps {
  children: ReactNode;
  workspaceId: string;
}

export function WorkspaceViewWrapper({ children }: WorkspaceViewWrapperProps) {
  return <>{children}</>;
}

export const WorkspaceDetailTitlebar = observer(function WorkspaceDetailTitlebar() {
  const {
    params: { workspaceId },
  } = useParams('workspace');
  const store = getWorkspaceStore(workspaceId);

  const leftSlot = store ? (
    <span className="text-lg font-semibold px-2">{store.data.name}</span>
  ) : null;

  return <Titlebar leftSlot={leftSlot} />;
});

function ProjectCard({
  project,
  onNavigate,
  onRemove,
}: {
  project: Project;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      {/* Left icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
        <Layers className="h-4 w-4 text-foreground-muted" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {/* Row 1: name + type */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm truncate flex-1">{project.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1 h-4 shrink-0 font-normal">
            {project.type === 'ssh' ? 'SSH' : 'Local'}
          </Badge>
        </div>

        {/* Row 2: path */}
        <span className="text-xs text-foreground-passive truncate">{project.path}</span>
      </div>

      {/* Remove button */}
      <div className="flex items-center shrink-0 mt-0.5">
        <SidebarItemMiniButton
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from workspace"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </SidebarItemMiniButton>
      </div>
    </div>
  );
}

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

function TaskRowCompact({ task, onClick }: { task: Task; onClick: () => void }) {
  const statusColor = STATUS_COLORS[task.status] ?? 'text-foreground-muted';
  const badgeVariant = STATUS_BADGE_VARIANT[task.status] ?? 'outline';
  const prCount = task.prs?.length ?? 0;

  return (
    <button
      onClick={onClick}
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
          {task.isPinned && <Pin className="h-3 w-3 text-foreground-passive shrink-0 rotate-45" />}
          <span className="text-sm truncate flex-1">{task.name}</span>
          <Badge
            variant={badgeVariant}
            className={cn('text-[10px] px-1 h-4 shrink-0 font-normal', statusColor)}
          >
            {task.status === 'in_progress' ? 'in progress' : task.status}
          </Badge>
        </div>

        {/* Row 2: branch + PR + time */}
        <div className="flex items-center gap-2 text-xs text-foreground-passive min-w-0">
          {task.taskBranch && (
            <span className="flex items-center gap-1 shrink-0 truncate max-w-[80px]">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{task.taskBranch}</span>
            </span>
          )}
          {prCount > 0 && (
            <span className="shrink-0">
              {prCount} PR{prCount > 1 ? 's' : ''}
            </span>
          )}
          <span className="shrink-0 ml-auto font-mono">
            <RelativeTime
              value={task.lastInteractedAt ?? task.createdAt}
              className="text-[10px]"
              compact
            />
          </span>
        </div>
      </div>
    </button>
  );
}

export const WorkspaceDetailMainPanel = observer(function WorkspaceDetailMainPanel() {
  const { navigate } = useNavigate();
  const showSelectProjectModal = useShowModal('selectProjectModal');
  const showCreateTaskModal = useShowModal('taskModal');
  const showAlertWarning = useShowModal('alertWarningDialog');
  const {
    params: { workspaceId },
  } = useParams('workspace');

  // Ensure the workspace exists in the manager store
  useEffect(() => {
    void workspaceManagerStore.load();
  }, []);

  const store = getWorkspaceStore(workspaceId);

  useEffect(() => {
    if (store && store.status === 'unloaded') {
      store.load();
    }
  }, [store]);

  if (!store) {
    return <div className="p-6">Workspace not found</div>;
  }

  if (store.status === 'loading') {
    return <div className="p-6">Loading...</div>;
  }

  if (store.status === 'error') {
    return <div className="p-6 text-red-500">Error: {store.error}</div>;
  }

  const projects = store.status === 'ready' ? store.projects : [];
  const tasks = store.status === 'ready' ? store.tasks : [];
  const activeTasks = tasks.filter((t) => !t.archivedAt);

  const handleDeleteWorkspace = async () => {
    if (confirm('Are you sure you want to delete this workspace?')) {
      await workspaceManagerStore.deleteWorkspace(workspaceId);
      navigate('home');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    const projectName = projects.find((p) => p.id === projectId)?.name ?? 'This project';
    const result = await rpc.workspace.canRemoveProjectFromWorkspace(workspaceId, projectId);
    const { taskCount } = result;
    if (taskCount > 0) {
      showAlertWarning({
        title: 'Cannot remove project',
        message: `"${projectName}" cannot be removed from this workspace because it has ${taskCount} task(s) associated with it.`,
        details: 'Archive or delete the tasks in this workspace first, then try again.',
      });
      return;
    }
    await rpc.workspace.removeProjectFromWorkspace(workspaceId, projectId);
    await (store as WorkspaceStoreClass).load();
  };

  const handleTaskClick = async (task: Task) => {
    // Use the first project from the workspace's projects
    const firstProjectId = projects[0]?.id;
    if (!firstProjectId) return;
    navigate('task', { projectId: firstProjectId, taskId: task.id });
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header Section */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-2">
              <Layers className="h-5 w-5 text-foreground-muted" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{store.data.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {projects.length} projects, {tasks.length} tasks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => showSelectProjectModal({ workspaceId })}
            >
              <FolderPlus className="size-3.5" />
              Add Project
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => showCreateTaskModal({ workspaceId })}
              disabled={projects.length === 0}
            >
              <Plus className="size-3.5" />
              New Task
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon-sm">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void handleDeleteWorkspace()}>
                  <Trash2 className="size-4" />
                  Delete workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {/* Projects Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground-muted">
              Projects ({projects.length})
            </h3>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              label="No projects"
              description="Add a project to this workspace to start working on tasks."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {projects.map((project: Project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onNavigate={() => navigate('project', { projectId: project.id })}
                  onRemove={() => void handleRemoveProject(project.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Tasks Section */}
        {activeTasks.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground-muted">
                Tasks ({activeTasks.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {activeTasks.map((task: Task) => (
                <TaskRowCompact
                  key={task.id}
                  task={task}
                  onClick={() => void handleTaskClick(task)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
});

export const workspaceDetailView = {
  WrapView: WorkspaceViewWrapper,
  TitlebarSlot: WorkspaceDetailTitlebar,
  MainPanel: WorkspaceDetailMainPanel,
};

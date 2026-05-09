import { Folder, Layers, MessageSquare, MoreVertical, Trash2, Wifi } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import type { Task } from '@shared/tasks';
import type { Workspace } from '@shared/workspaces';
import {
  asMounted,
  getProjectManagerStore,
  getProjectStore,
  projectDisplayName,
  projectViewKind,
} from '@renderer/features/projects/stores/project-selectors';
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

export const ProjectDetailTitlebar = observer(function ProjectDetailTitlebar() {
  const {
    params: { projectId },
  } = useParams('projectDetail');
  const { navigate } = useNavigate();
  const store = getProjectStore(projectId);
  const displayName = projectDisplayName(store);
  const showConfirmDeleteProject = useShowModal('confirmActionModal');
  const projectManagerStore = getProjectManagerStore();

  const handleDelete = () => {
    showConfirmDeleteProject({
      title: 'Delete project',
      description: `"${displayName}" will be deleted. The project folder and worktrees will stay on the filesystem.`,
      confirmLabel: 'Delete',
      onSuccess: () => {
        void projectManagerStore.deleteProject(projectId);
        navigate('home');
      },
    });
  };

  const leftSlot = (
    <div className="flex items-center px-2 gap-2">
      <span className="text-sm font-medium">{displayName}</span>
    </div>
  );

  const rightSlot = (
    <div className="flex items-center gap-2 mr-2">
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="ghost" size="icon-sm">
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleDelete}>
            <Trash2 className="size-4" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return <Titlebar leftSlot={leftSlot} rightSlot={rightSlot} />;
});

export const ProjectDetailMainPanel = observer(function ProjectDetailMainPanel() {
  const {
    params: { projectId },
  } = useParams('projectDetail');
  const { navigate } = useNavigate();

  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);
  const mounted = asMounted(store);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    if (!projectId) return;

    // Load workspaces for this project
    setLoadingWorkspaces(true);
    rpc.workspace
      .getProjectWorkspaces(projectId)
      .then((ws) => setWorkspaces(ws))
      .catch(() => setWorkspaces([]))
      .finally(() => setLoadingWorkspaces(false));

    // Load tasks for this project
    setLoadingTasks(true);
    rpc.tasks
      .getTasks(projectId)
      .then((ts) => setTasks(ts))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [projectId]);

  if (!store) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState label="Project not found" />
      </div>
    );
  }

  if (kind === 'missing') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState label="Project not found" description="This project may have been deleted." />
      </div>
    );
  }

  const project = mounted?.data ?? store?.data;
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState label="Loading..." />
      </div>
    );
  }

  const isSsh = project.type === 'ssh';
  const activeTasks = tasks.filter((t) => !t.archivedAt);

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate('workspace', { workspaceId });
  };

  const handleTaskClick = (taskId: string) => {
    navigate('task', { projectId, taskId });
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header Section */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-2">
              {isSsh ? (
                <Wifi className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Folder className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{project.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{project.path}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {isSsh ? 'SSH' : 'Local'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Created <RelativeTime value={project.createdAt} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {/* Workspaces Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground-muted">
              Linked Workspaces ({workspaces.length})
            </h3>
          </div>
          {loadingWorkspaces ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : workspaces.length === 0 ? (
            <EmptyState
              label="No linked workspaces"
              description="This project is not part of any workspace."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleWorkspaceClick(ws.id)}
                  className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors cursor-pointer"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background-2 shrink-0">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate text-sm">{ws.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Created <RelativeTime value={ws.createdAt} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Tasks Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground-muted">
              Tasks ({activeTasks.length})
            </h3>
          </div>
          {loadingTasks ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : activeTasks.length === 0 ? (
            <EmptyState
              label="No tasks"
              description="Create a task to start working with AI on this project."
            />
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {activeTasks.slice(0, 10).map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className="flex items-center gap-3 p-3 hover:bg-background-1 transition-colors w-full text-left"
                >
                  <MessageSquare className="h-4 w-4 text-foreground-muted shrink-0" />
                  <span className="truncate flex-1 text-sm">{task.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {task.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});

export const projectDetailView = {
  TitlebarSlot: ProjectDetailTitlebar,
  MainPanel: ProjectDetailMainPanel,
};

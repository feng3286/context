import {
  ExternalLink,
  Folder,
  GitPullRequest,
  Layers,
  Link,
  ListTodo,
  MoreVertical,
  Settings,
  Trash2,
  Wifi,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Task, TaskLifecycleStatus } from '@shared/tasks';
import type { Workspace } from '@shared/workspaces';
import {
  ProjectBootstrapErrorPanel,
  ProjectBootstrappingPanel,
  ProjectPathNotFoundPanel,
  ProjectSshDisconnectedPanel,
} from '@renderer/features/projects/components/main-panel/main-panel';
import {
  asMounted,
  getProjectManagerStore,
  getProjectStore,
  getRepositoryStore,
  projectDisplayName,
  projectViewKind,
  unmountedMountErrorMessage,
} from '@renderer/features/projects/stores/project-selectors';
import { getTaskManagerStore } from '@renderer/features/tasks/stores/task-selectors';
import { OpenInMenu } from '@renderer/lib/components/titlebar/open-in-menu';
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
import { Separator } from '@renderer/lib/ui/separator';
import { cn } from '@renderer/utils/utils';

// ─ Context ──

interface ProjectDetailContextValue {
  workspaceId?: string;
}

const ProjectDetailContext = createContext<ProjectDetailContextValue>({
  workspaceId: undefined,
});

interface ProjectDetailViewWrapperProps {
  children: ReactNode;
  projectId: string;
  workspaceId?: string;
}

export function ProjectDetailViewWrapper({ children, workspaceId }: ProjectDetailViewWrapperProps) {
  return (
    <ProjectDetailContext.Provider value={{ workspaceId }}>
      {children}
    </ProjectDetailContext.Provider>
  );
}

// ── Titlebar ──

export const ProjectDetailTitlebar = observer(function ProjectDetailTitlebar() {
  const {
    params: { projectId },
  } = useParams('projectDetail');
  const { navigate } = useNavigate();
  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);
  const displayName = projectDisplayName(store);
  const showConfirmDeleteProject = useShowModal('confirmActionModal');
  const projectManagerStore = getProjectManagerStore();

  const repo = getRepositoryStore(projectId);
  const configuredRemote = repo?.configuredRemote;
  const remoteUrl = configuredRemote?.url;
  const repositoryUrl = repo?.repositoryUrl;

  const isGithubUrl = repositoryUrl?.includes('github.com');
  const repoLabel = repositoryUrl
    ? repositoryUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')
    : remoteUrl?.replace(/^https?:\/\//, '');

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

  if (kind !== 'ready') {
    return (
      <Titlebar
        leftSlot={
          <div className="flex items-center px-2 gap-2">
            <span className="text-sm font-medium">{displayName}</span>
          </div>
        }
      />
    );
  }

  const mounted = asMounted(store);
  if (!mounted) {
    return (
      <Titlebar
        leftSlot={
          <div className="flex items-center px-2 gap-2">
            <span className="text-sm font-medium">{displayName}</span>
          </div>
        }
      />
    );
  }

  const isSsh = mounted.data.type === 'ssh';

  const leftSlot = (
    <div className="flex items-center px-2 gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex items-center gap-1.5 text-foreground-muted text-sm hover:text-foreground group">
              <span className="text-sm">{displayName}</span>
              <MoreVertical className="size-3.5" />
            </button>
          }
        >
          <Trash2 className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-40">
          <DropdownMenuItem
            className="flex items-center gap-2 text-foreground-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="size-4" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {remoteUrl && (
        <>
          <Separator
            orientation="vertical"
            className="h-4 data-[orientation=vertical]:self-center"
          />
          <button
            className="flex items-center gap-1.5 text-foreground-muted text-sm hover:text-foreground group transition-colors"
            onClick={() => void rpc.app.openExternal(remoteUrl ?? '')}
          >
            <div className="text-sm flex items-center gap-1">
              {isGithubUrl ? (
                <svg
                  className="size-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.001 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
              ) : (
                <ExternalLink className="size-3.5" />
              )}
              <span className="truncate">{repoLabel}</span>
            </div>
            <ExternalLink className="size-3.5 shrink-0 opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground transition-opacity" />
          </button>
        </>
      )}
    </div>
  );

  const rightSlot = (
    <div className="flex items-center gap-2 mr-2">
      {!isSsh && (
        <OpenInMenu
          path={mounted.data.path}
          isRemote={false}
          sshConnectionId={null}
          className="h-7 bg-background"
        />
      )}
    </div>
  );

  return <Titlebar leftSlot={leftSlot} rightSlot={rightSlot} />;
});

// ── Workspace card ──

function WorkspaceCard({
  workspace,
  onNavigate,
}: {
  workspace: Workspace;
  onNavigate: () => void;
}) {
  return (
    <div
      className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
        <Layers className="h-4 w-4 text-foreground-muted" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm truncate">{workspace.name}</span>
        <span className="text-xs text-foreground-passive">
          Created <RelativeTime value={workspace.createdAt} />
        </span>
      </div>
    </div>
  );
}

// ── Linked task card ──

const TASK_STATUS_COLORS: Record<TaskLifecycleStatus, string> = {
  todo: 'text-foreground-passive',
  in_progress: 'text-blue-500',
  review: 'text-amber-500',
  done: 'text-green-500',
  cancelled: 'text-red-500',
};

const TASK_STATUS_BADGE: Record<TaskLifecycleStatus, 'outline' | 'secondary'> = {
  todo: 'outline',
  in_progress: 'secondary',
  review: 'secondary',
  done: 'secondary',
  cancelled: 'outline',
};

function LinkedTaskCard({
  task,
  workspaceName,
  onNavigate,
}: {
  task: Task;
  workspaceName: string;
  onNavigate: () => void;
}) {
  const statusColor = TASK_STATUS_COLORS[task.status];
  const badgeVariant = TASK_STATUS_BADGE[task.status];
  const prCount = task.prs?.length ?? 0;

  return (
    <button
      onClick={onNavigate}
      className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors text-left min-w-0 cursor-pointer"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
        <ListTodo className="h-4 w-4 text-foreground-muted" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm truncate flex-1">{task.name}</span>
          <Badge
            variant={badgeVariant}
            className={cn('text-[10px] px-1 h-4 shrink-0 font-normal', statusColor)}
          >
            {task.status === 'in_progress' ? 'in progress' : task.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground-passive min-w-0">
          <span className="truncate">{workspaceName}</span>
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

// ── Main Panel ──

export const ProjectDetailMainPanel = observer(function ProjectDetailMainPanel() {
  const {
    params: { projectId },
  } = useParams('projectDetail');
  const { navigate } = useNavigate();
  const ctx = useContext(ProjectDetailContext);

  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const showPullRequestsModal = useShowModal('pullRequestsModal');
  const showProjectSettingsModal = useShowModal('projectSettingsModal');

  useEffect(() => {
    if (!projectId) return;
    setLoadingWorkspaces(true);
    rpc.workspace
      .getProjectWorkspaces(projectId)
      .then((ws) => setWorkspaces(ws))
      .catch(() => setWorkspaces([]))
      .finally(() => setLoadingWorkspaces(false));
  }, [projectId]);

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate('workspace', { workspaceId });
  };

  // ── State routing ──

  if (kind === 'bootstrapping') return <ProjectBootstrappingPanel />;
  if (kind === 'path_not_found')
    return <ProjectPathNotFoundPanel path={store?.error ?? ''} projectId={projectId} />;
  if (kind === 'ssh_disconnected')
    return <ProjectSshDisconnectedPanel connectionId={store?.error ?? ''} projectId={projectId} />;
  if (kind === 'mount_error')
    return <ProjectBootstrapErrorPanel message={unmountedMountErrorMessage(store)} />;
  if (!store || kind === 'missing') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState label="Project not found" />
      </div>
    );
  }

  const mounted = asMounted(store);
  const project = mounted?.data ?? store?.data;
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState label="Loading..." />
      </div>
    );
  }

  const isSsh = project.type === 'ssh';

  // Build workspace name lookup
  const workspaceNameMap = new Map(workspaces.map((ws) => [ws.id, ws.name]));

  // Get linked tasks from task manager
  const taskManager = getTaskManagerStore(projectId);
  const allTasks = taskManager
    ? Array.from(taskManager.tasks.values())
        .filter((t): t is typeof t & { data: Task } => t.state !== 'unregistered')
        .map((t) => t.data)
        .filter((t) => !t.archivedAt)
    : [];

  const linkedTasks = allTasks.sort(
    (a, b) =>
      new Date(b.lastInteractedAt ?? b.createdAt).getTime() -
      new Date(a.lastInteractedAt ?? a.createdAt).getTime()
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground min-h-0">
      {/* ── Header ─ */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-2">
              {isSsh ? (
                <Wifi className="h-5 w-5 text-foreground-muted" />
              ) : (
                <Folder className="h-5 w-5 text-foreground-muted" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="text-sm text-foreground-muted mt-0.5 truncate max-w-sm">
                {project.path}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs">
              {isSsh ? 'SSH' : 'Local'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => showPullRequestsModal({ projectId })}
            >
              <GitPullRequest className="size-3.5" />
              PRs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => showProjectSettingsModal({ projectId })}
            >
              <Settings className="size-3.5" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Linked Workspaces */}
        <section>
          <h3 className="text-sm font-medium text-foreground-muted mb-3">Linked Workspaces</h3>
          {loadingWorkspaces ? (
            <div className="text-sm text-foreground-passive">Loading...</div>
          ) : workspaces.length === 0 ? (
            <EmptyState
              label="No linked workspaces"
              description="This project is not part of any workspace."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {workspaces.map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  onNavigate={() => handleWorkspaceClick(ws.id)}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Linked Tasks */}
        <section>
          <h3 className="text-sm font-medium text-foreground-muted mb-3">Linked Tasks</h3>
          {linkedTasks.length === 0 ? (
            <EmptyState
              label="No linked tasks"
              description="Tasks will appear here when they are created for this project."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {linkedTasks.map((task) => (
                <LinkedTaskCard
                  key={task.id}
                  task={task}
                  workspaceName={workspaceNameMap.get(task.workspaceId) ?? ''}
                  onNavigate={() => navigate('task', { projectId, taskId: task.id })}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});

export const projectDetailView = {
  WrapView: ProjectDetailViewWrapper,
  TitlebarSlot: ProjectDetailTitlebar,
  MainPanel: ProjectDetailMainPanel,
};

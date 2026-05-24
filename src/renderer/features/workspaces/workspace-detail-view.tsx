import { FolderPlus, Layers, MessageSquare, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, type ReactNode } from 'react';
import type { Project } from '@shared/projects';
import type { Task } from '@shared/tasks';
import { SidebarItemMiniButton } from '@renderer/features/sidebar/sidebar-primitives';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
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
import { debugLog } from '@renderer/utils/debug-logger';
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
      className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-background hover:bg-background-1 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background-2 shrink-0">
        <Layers className="h-4 w-4 text-foreground-muted" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-medium truncate">{project.name}</span>
        <span className="text-sm text-muted-foreground truncate mt-0.5">{project.path}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="secondary" className="text-xs">
          {project.type === 'ssh' ? 'SSH' : 'Local'}
        </Badge>
        <SidebarItemMiniButton
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove project"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </SidebarItemMiniButton>
      </div>
    </div>
  );
}

function TaskRowCompact({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 hover:bg-background-1 transition-colors w-full text-left"
    >
      <MessageSquare className="h-4 w-4 text-foreground-muted shrink-0" />
      <span className="truncate flex-1">{task.name}</span>
      <Badge variant="outline" className="text-xs shrink-0">
        {task.status}
      </Badge>
    </button>
  );
}

export const WorkspaceDetailMainPanel = observer(function WorkspaceDetailMainPanel() {
  const { navigate } = useNavigate();
  const showSelectProjectModal = useShowModal('selectProjectModal');
  const showCreateTaskModal = useShowModal('taskModal');
  const {
    params: { workspaceId },
  } = useParams('workspace');

  // Ensure the workspace exists in the manager store
  useEffect(() => {
    debugLog('workspace-detail', 'WorkspaceDetailMainPanel mounted, loading workspaceManager');
    void workspaceManagerStore.load();
  }, []);

  const store = getWorkspaceStore(workspaceId);

  debugLog('workspace-detail', 'render', {
    workspaceId,
    hasStore: !!store,
    status: store?.status,
    projectCount: store?.projects.length,
  });

  useEffect(() => {
    if (store && store.status === 'unloaded') {
      debugLog('workspace-detail', 'loading specific workspace (unloaded)');
      store.load();
    }
  }, [store]);

  if (!store) {
    debugLog('workspace-detail', 'EARLY RETURN: workspace not found', { workspaceId });
    return <div className="p-6">Workspace not found</div>;
  }

  if (store.status === 'loading') {
    return <div className="p-6">Loading...</div>;
  }

  if (store.status === 'error') {
    debugLog('workspace-detail', 'EARLY RETURN: error', { error: store.error });
    return <div className="p-6 text-red-500">Error: {store.error}</div>;
  }

  const projects = store.status === 'ready' ? store.projects : [];
  const tasks = store.status === 'ready' ? store.tasks : [];

  debugLog('workspace-detail', 'rendering main content', {
    projectCount: projects.length,
    taskCount: tasks.length,
  });
  const activeTasks = tasks.filter((t) => !t.archivedAt).slice(0, 5);

  const handleDeleteWorkspace = async () => {
    if (confirm('Are you sure you want to delete this workspace?')) {
      await workspaceManagerStore.deleteWorkspace(workspaceId);
      navigate('home');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    await (store as WorkspaceStoreClass).removeProject(projectId);
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
        {tasks.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground-muted">
                Recent Tasks ({activeTasks.length}/{tasks.length})
              </h3>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
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

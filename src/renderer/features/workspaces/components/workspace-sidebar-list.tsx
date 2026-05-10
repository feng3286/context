import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  Layers,
  Link2,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import type { Project } from '@shared/projects';
import type { Task } from '@shared/tasks';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import {
  SidebarItemMiniButton,
  SidebarMenuRow,
} from '@renderer/features/sidebar/sidebar-primitives';
import {
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
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
        title="Delete workspace"
        className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </SidebarItemMiniButton>
    </SidebarMenuRow>
  );
}

function ProjectSidebarRow({
  project,
  workspaceId,
  isActive,
  onNavigate,
  onRemove,
}: {
  project: Project;
  workspaceId: string;
  isActive: boolean;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  return (
    <SidebarMenuRow
      isActive={isActive}
      className="group/project pl-3 pr-1.5 h-7 gap-1.5 rounded-md mx-0.5"
      onClick={onNavigate}
    >
      <FolderClosed className="h-3.5 w-3.5 shrink-0 text-foreground-tertiary-muted" />
      <span className="truncate flex-1">{project.name}</span>
      <Badge variant="outline" className="text-[10px] px-1 h-4 shrink-0">
        {project.type === 'ssh' ? 'SSH' : 'Local'}
      </Badge>
      <SidebarItemMiniButton
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove project"
        className="opacity-0 group-hover/project:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3 w-3" />
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
        title="Delete task"
        className="opacity-0 group-hover/task:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3 w-3" />
      </SidebarItemMiniButton>
    </SidebarMenuRow>
  );
}

export const WorkspaceSidebarList = observer(function WorkspaceSidebarList() {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { params } = useParams('workspace');
  const projectParams = useParams('project');
  const taskParams = useParams('task');
  const showAddProjectModal = useShowModal('addProjectModal');
  const showCreateTaskModal = useShowModal('taskModal');
  const showSelectProjectModal = useShowModal('selectProjectModal');

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

  useEffect(() => {
    workspaceManagerStore.load();
  }, []);

  const workspaces = Array.from(workspaceManagerStore.workspaces.values());
  const activeWorkspaceId = currentView === 'workspace' ? params.workspaceId : null;

  // Get current workspace context from project view (if navigating from workspace)
  const currentProjectWorkspaceId =
    currentView === 'project' ? projectParams.params.workspaceId : null;

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
    if (confirm('Delete this workspace?')) {
      await workspaceManagerStore.deleteWorkspace(workspaceId);
    }
  };

  const handleRemoveProject = async (workspaceId: string, projectId: string) => {
    const store = workspaceManagerStore.getWorkspace(workspaceId);
    if (store) {
      await (store as WorkspaceStoreClass).removeProject(projectId);
    }
  };

  const handleTaskClick = async (task: Task) => {
    // Ensure project is loaded and mounted before navigating
    const projectManager = getProjectManagerStore();
    const projectStore = projectManager.projects.get(task.projectId);

    if (!projectStore) {
      // Project not in store, need to load first
      await projectManager.load();
    }

    // Check again after load
    const projectStoreAfterLoad = projectManager.projects.get(task.projectId);
    if (projectStoreAfterLoad) {
      // Mount the project if not already mounted
      await projectManager.mountProject(task.projectId);
    }

    // Navigate to task view
    navigate('task', { projectId: task.projectId, taskId: task.id });
  };

  const handleDeleteTask = async (workspaceId: string, task: Task) => {
    if (confirm(`Delete task "${task.name}"?`)) {
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store) {
        await (store as WorkspaceStoreClass).deleteTask(task.projectId, task.id);
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

            {/* Expanded content: Projects & Tasks */}
            {isExpanded && (
              <div className="ml-3 mt-1.5 mb-2 space-y-2">
                {/* Projects section */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between px-2 py-0.5 h-6">
                    <span className="text-xs font-medium text-foreground-tertiary-muted flex items-center gap-1">
                      <FolderClosed className="h-3 w-3" />
                      Projects ({projects.length})
                    </span>
                    <div className="flex items-center gap-0.5">
                      <SidebarItemMiniButton
                        onClick={(e) => {
                          e.stopPropagation();
                          showSelectProjectModal({ workspaceId: store.data.id });
                        }}
                        title="Link existing project"
                        className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </SidebarItemMiniButton>
                      <SidebarItemMiniButton
                        onClick={(e) => {
                          e.stopPropagation();
                          showAddProjectModal({ workspaceId: store.data.id });
                        }}
                        title="Create new project"
                        className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </SidebarItemMiniButton>
                    </div>
                  </div>
                  {projects.length === 0 ? (
                    <div className="text-xs text-foreground-tertiary-muted px-3 py-1 opacity-60">
                      No projects
                    </div>
                  ) : (
                    projects.map((project) => (
                      <ProjectSidebarRow
                        key={`${store.data.id}:${project.id}`}
                        project={project}
                        workspaceId={store.data.id}
                        isActive={
                          currentView === 'project' &&
                          projectParams.params.projectId === project.id &&
                          projectParams.params.workspaceId === store.data.id
                        }
                        onNavigate={() =>
                          navigate('project', { projectId: project.id, workspaceId: store.data.id })
                        }
                        onRemove={() => void handleRemoveProject(store.data.id, project.id)}
                      />
                    ))
                  )}
                </div>

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
                      title="New task"
                      className="opacity-0 group-hover/workspace:opacity-100 transition-opacity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </SidebarItemMiniButton>
                  </div>
                  {tasks.length === 0 ? (
                    <div className="text-xs text-foreground-tertiary-muted px-3 py-1 opacity-60">
                      No tasks
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <TaskSidebarRow
                        key={task.id}
                        task={task}
                        isActive={currentView === 'task' && taskParams.params.taskId === task.id}
                        onClick={() => void handleTaskClick(task)}
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
          No workspaces yet. Create a workspace to organize your projects.
        </div>
      )}
    </div>
  );
});

import { ChevronDown, ChevronRight, Link2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
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
import { workspaceManagerStore } from '../stores/workspace-manager';
import { WorkspaceStoreClass } from '../stores/workspace-store';

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
    <div className="flex flex-col min-h-0 flex-1 px-3 pt-1 pb-3 overflow-y-auto">
      {workspaces.map((store) => {
        const isExpanded = expandedWorkspaces.has(store.data.id);
        const isActive = store.data.id === activeWorkspaceId;
        const projects = store.status === 'ready' ? store.projects : [];
        const tasks = store.status === 'ready' ? store.tasks : [];

        return (
          <div key={store.data.id} className="mb-1">
            {/* Workspace header - click name to navigate, click chevron to expand */}
            <SidebarMenuRow isActive={isActive} className="pr-1">
              <button
                className="p-0.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(store.data.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              <span
                className="truncate flex-1 cursor-pointer hover:underline"
                onClick={() => handleWorkspaceClick(store.data.id)}
              >
                {store.data.name}
              </span>
              <SidebarItemMiniButton
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteWorkspace(store.data.id);
                }}
                title="Delete workspace"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </SidebarItemMiniButton>
            </SidebarMenuRow>

            {/* Expanded content: Projects & Tasks */}
            {isExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {/* Projects section */}
                <div className="flex items-center justify-between px-2 py-0.5">
                  <span className="text-xs font-medium text-foreground-tertiary-muted">
                    Projects ({projects.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <SidebarItemMiniButton
                      onClick={(e) => {
                        e.stopPropagation();
                        showSelectProjectModal({ workspaceId: store.data.id });
                      }}
                      title="Link existing project"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </SidebarItemMiniButton>
                    <SidebarItemMiniButton
                      onClick={(e) => {
                        e.stopPropagation();
                        showAddProjectModal({ workspaceId: store.data.id });
                      }}
                      title="Create new project"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </SidebarItemMiniButton>
                  </div>
                </div>
                {projects.map((project) => (
                  <SidebarMenuRow
                    key={project.id}
                    isActive={
                      currentView === 'project' && projectParams.params.projectId === project.id
                    }
                    className="pl-2 pr-1 text-xs"
                    onClick={() => navigate('project', { projectId: project.id })}
                  >
                    <span className="truncate flex-1">{project.name}</span>
                    <SidebarItemMiniButton
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveProject(store.data.id, project.id);
                      }}
                      title="Remove project"
                    >
                      <Trash2 className="h-3 w-3" />
                    </SidebarItemMiniButton>
                  </SidebarMenuRow>
                ))}

                {/* Tasks section */}
                <div className="flex items-center justify-between px-2 py-0.5 mt-2">
                  <span className="text-xs font-medium text-foreground-tertiary-muted">
                    Tasks ({tasks.length})
                  </span>
                  <SidebarItemMiniButton
                    onClick={(e) => {
                      e.stopPropagation();
                      showCreateTaskModal({ workspaceId: store.data.id });
                    }}
                    title="New task"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </SidebarItemMiniButton>
                </div>
                {tasks.map((task) => (
                  <SidebarMenuRow
                    key={task.id}
                    isActive={currentView === 'task' && taskParams.params.taskId === task.id}
                    className="pl-2 pr-1 text-xs"
                    onClick={() => void handleTaskClick(task)}
                  >
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1 ml-1">{task.name}</span>
                    <SidebarItemMiniButton
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteTask(store.data.id, task);
                      }}
                      title="Delete task"
                    >
                      <Trash2 className="h-3 w-3" />
                    </SidebarItemMiniButton>
                  </SidebarMenuRow>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {workspaces.length === 0 && (
        <div className="text-xs text-foreground-tertiary-muted px-3 py-2">No workspaces yet</div>
      )}
    </div>
  );
});

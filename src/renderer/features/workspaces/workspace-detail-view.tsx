import { FolderPlus, Plus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, type ReactNode } from 'react';
import type { Project } from '@shared/projects';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
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

export const WorkspaceDetailMainPanel = observer(function WorkspaceDetailMainPanel() {
  const { navigate } = useNavigate();
  const showAddProjectModal = useShowModal('addProjectModal');
  const showCreateTaskModal = useShowModal('taskModal');
  const {
    params: { workspaceId },
  } = useParams('workspace');

  const store = getWorkspaceStore(workspaceId);

  useEffect(() => {
    if (store && store.status === 'unloaded') {
      // Load projects for this workspace
      const storeClass = store as unknown as WorkspaceStoreClass;
      storeClass.load();
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

  // Only access projects when status is ready
  const projects = store.status === 'ready' ? store.projects : [];

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xl font-bold">{store.data.name}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => showAddProjectModal({})}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm border border-border hover:bg-background-1"
          >
            <FolderPlus className="h-4 w-4" />
            Add Project
          </button>
          <button
            onClick={() => showCreateTaskModal({ projectId: projects[0]?.id })}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-primary text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 p-4 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Projects</h3>
        <div className="grid gap-2">
          {projects.map((project: Project) => (
            <button
              key={project.id}
              onClick={() => navigate('project', { projectId: project.id })}
              className="flex items-center justify-between p-3 rounded border border-border hover:bg-background-1"
            >
              <div className="flex flex-col">
                <span className="font-medium">{project.name}</span>
                <span className="text-sm text-muted-foreground">{project.path}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {project.type === 'ssh' ? 'SSH' : 'Local'}
              </span>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="text-muted-foreground">No projects in this workspace</p>
          )}
        </div>
      </div>
    </div>
  );
});

export const workspaceDetailView = {
  WrapView: WorkspaceViewWrapper,
  TitlebarSlot: WorkspaceDetailTitlebar,
  MainPanel: WorkspaceDetailMainPanel,
};

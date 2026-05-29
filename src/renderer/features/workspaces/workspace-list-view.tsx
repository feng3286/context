import { Folder, FolderPlus, Layers, Plus, Wifi } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import type { Project } from '@shared/projects';
import { isUnmountedProject } from '@renderer/features/projects/stores/project';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { workspaceManagerStore } from './stores/workspace-manager';

export const WorkspaceListTitlebar = observer(function WorkspaceListTitlebar() {
  return <Titlebar />;
});

export const WorkspaceListMainPanel = observer(function WorkspaceListMainPanel() {
  const { navigate } = useNavigate();
  const showCreateWorkspaceModal = useShowModal('createWorkspaceModal');
  const showAddProjectModal = useShowModal('addProjectModal');

  const projectManager = getProjectManagerStore();

  useEffect(() => {
    projectManager.load();
    workspaceManagerStore.load().then(() => {
      for (const store of workspaceManagerStore.workspaces.values()) {
        if (store.status === 'unloaded') {
          store.load();
        }
      }
    });
  }, []);

  const workspaceStores = Array.from(workspaceManagerStore.workspaces.values());

  // Get all projects directly from ProjectManagerStore
  const allProjects: Project[] = [];
  for (const store of projectManager.projects.values()) {
    if (isUnmountedProject(store)) {
      allProjects.push(store.data);
    } else if (store.data) {
      allProjects.push(store.data);
    }
  }

  const handleCreateWorkspace = () => {
    showCreateWorkspaceModal({});
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate('workspace', { workspaceId });
  };

  const handleProjectClick = (projectId: string) => {
    navigate('projectDetail', { projectId });
  };

  if (workspaceStores.length === 0 && allProjects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background-2 mb-4">
          <Layers className="h-8 w-8 text-primary/50" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Get Started</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
          Add a project to start working with AI-powered tasks, or create a workspace to organize
          multiple projects.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => showAddProjectModal({})}>
            <FolderPlus className="h-4 w-4" />
            Add Project
          </Button>
          <Button onClick={handleCreateWorkspace}>
            <Plus className="h-4 w-4" />
            Create Workspace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Home</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {workspaceStores.length} workspace{workspaceStores.length !== 1 ? 's' : ''},{' '}
              {allProjects.length} project{allProjects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => showAddProjectModal({})}>
              <FolderPlus className="size-3.5" />
              Add Project
            </Button>
            <Button size="sm" onClick={handleCreateWorkspace}>
              <Plus className="h-4 w-4" />
              New Workspace
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-8">
        {/* Projects section */}
        {allProjects.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Projects ({allProjects.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {allProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleProjectClick(project.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Workspaces section */}
        {workspaceStores.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Workspaces</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {workspaceStores.map((store) => (
                <WorkspaceCard
                  key={store.data.id}
                  store={store}
                  onClick={() => handleWorkspaceClick(store.data.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
});

function WorkspaceCard({
  store,
  onClick,
}: {
  store: typeof workspaceManagerStore.workspaces extends Map<string, infer V> ? V : never;
  onClick: () => void;
}) {
  const data = store.data;
  const isLoading = store.status === 'unloaded' || store.status === 'loading';
  const projects = store.status === 'ready' ? store.projects : [];
  const tasks = store.status === 'ready' ? store.tasks : [];

  return (
    <button
      onClick={onClick}
      className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors text-left cursor-pointer"
    >
      {/* Left icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
        <Layers className="h-4 w-4 text-foreground-muted" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {/* Row 1: name */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm truncate flex-1">{data.name}</span>
        </div>

        {/* Row 2: project/task count + created time */}
        <div className="flex items-center gap-2 text-xs text-foreground-passive min-w-0">
          <span className="shrink-0">
            {isLoading
              ? 'Loading...'
              : `${projects.length} project${projects.length !== 1 ? 's' : ''}, ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
          </span>
          <span className="shrink-0 ml-auto font-mono">
            <RelativeTime value={data.createdAt} compact />
          </span>
        </div>
      </div>
    </button>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const isSsh = project.type === 'ssh';

  return (
    <button
      onClick={onClick}
      className="group flex gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors text-left cursor-pointer"
    >
      {/* Left icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-2 group-hover:bg-background-2/60 transition-colors mt-0.5">
        {isSsh ? (
          <Wifi className="h-4 w-4 text-foreground-muted" />
        ) : (
          <Folder className="h-4 w-4 text-foreground-muted" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {/* Row 1: name + type */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm truncate flex-1">{project.name}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-passive bg-background-2 px-1.5 py-0.5 rounded shrink-0">
            {isSsh ? 'SSH' : 'Local'}
          </span>
        </div>

        {/* Row 2: path */}
        <span className="text-xs text-foreground-passive truncate">{project.path}</span>
      </div>
    </button>
  );
}

export const workspaceListView = {
  TitlebarSlot: WorkspaceListTitlebar,
  MainPanel: WorkspaceListMainPanel,
};

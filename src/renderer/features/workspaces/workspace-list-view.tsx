import { FolderOpen, Plus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import type { Workspace } from '@shared/workspaces';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { workspaceManagerStore } from './stores/workspace-manager';

export const WorkspaceListTitlebar = observer(function WorkspaceListTitlebar() {
  return <Titlebar />;
});

export const WorkspaceListMainPanel = observer(function WorkspaceListMainPanel() {
  const { navigate } = useNavigate();
  const showCreateWorkspaceModal = useShowModal('createWorkspaceModal');

  useEffect(() => {
    workspaceManagerStore.load();
  }, []);

  const workspaces = Array.from(workspaceManagerStore.workspaces.values());

  const handleCreateWorkspace = () => {
    showCreateWorkspaceModal({});
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate('workspace', { workspaceId });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <button
          onClick={handleCreateWorkspace}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Workspace
        </button>
      </div>

      <div className="grid gap-4">
        {workspaces.map((store) => (
          <WorkspaceCard
            key={store.data.id}
            workspace={store.data}
            onClick={() => handleWorkspaceClick(store.data.id)}
          />
        ))}
      </div>

      {workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mb-4" />
          <p>No workspaces yet. Create one to start.</p>
        </div>
      )}
    </div>
  );
});

function WorkspaceCard({ workspace, onClick }: { workspace: Workspace; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col p-4 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors"
    >
      <span className="text-lg font-semibold">{workspace.name}</span>
      {workspace.workDir && (
        <span className="text-sm text-muted-foreground truncate">{workspace.workDir}</span>
      )}
    </button>
  );
}

export const workspaceListView = {
  TitlebarSlot: WorkspaceListTitlebar,
  MainPanel: WorkspaceListMainPanel,
};

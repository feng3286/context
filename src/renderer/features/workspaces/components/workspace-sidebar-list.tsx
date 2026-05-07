import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useNavigate, useParams, useWorkspaceSlots } from '@renderer/lib/layout/navigation-provider';
import { SidebarMenuRow } from '@renderer/features/sidebar/sidebar-primitives';
import { workspaceManagerStore } from '../stores/workspace-manager';

export const WorkspaceSidebarList = observer(function WorkspaceSidebarList() {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { params } = useParams('workspace');

  useEffect(() => {
    workspaceManagerStore.load();
  }, []);

  const workspaces = Array.from(workspaceManagerStore.workspaces.values());
  const activeWorkspaceId = currentView === 'workspace' ? params.workspaceId : null;

  return (
    <div className="flex flex-col min-h-0 flex-1 px-3 pt-1 pb-3 overflow-y-auto">
      {workspaces.map((store) => (
        <SidebarMenuRow
          key={store.data.id}
          isActive={store.data.id === activeWorkspaceId}
          onClick={() => navigate('workspace', { workspaceId: store.data.id })}
        >
          <span className="truncate">{store.data.name}</span>
        </SidebarMenuRow>
      ))}
      {workspaces.length === 0 && (
        <div className="text-xs text-foreground-tertiary-muted px-3 py-2">
          No workspaces yet
        </div>
      )}
    </div>
  );
});
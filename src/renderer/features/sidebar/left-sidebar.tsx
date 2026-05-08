import { FolderPlus, MessageSquareShare, Plug, Plus, Puzzle, Settings } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { WorkspaceSidebarList } from '@renderer/features/workspaces/components/workspace-sidebar-list';
import {
  isCurrentView,
  useNavigate,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { SidebarPinnedTaskList } from './pinned-task-list';
import {
  SidebarContainer,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
} from './sidebar-primitives';
import { SidebarSpace } from './sidebar-space';
import { UpdateSection } from './update-section';

export const LeftSidebar: React.FC = observer(function LeftSidebar() {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();

  const showAddProjectModal = useShowModal('addProjectModal');
  const showFeedbackModal = useShowModal('feedbackModal');
  const showCreateWorkspaceModal = useShowModal('createWorkspaceModal');

  return (
    <div className="flex flex-col h-full bg-background-tertiary text-foreground-tertiary-muted">
      <SidebarSpace />
      <SidebarContainer className="w-full border-r-0 flex-1 min-h-0">
        <SidebarContent className="flex flex-col">
          <SidebarPinnedTaskList />
          <SidebarGroup className="mb-0 min-h-0 flex-1 flex flex-col">
            <div className="px-3 py-1 text-xs font-medium text-foreground-tertiary-muted uppercase tracking-wider">
              Workspaces
            </div>
            <SidebarGroupContent className="min-h-0 flex-1 flex flex-col">
              <SidebarMenu className="flex-1 min-h-0 flex flex-col">
                <WorkspaceSidebarList />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuButton
              isActive={false}
              onClick={() => showCreateWorkspaceModal({})}
              aria-label="Create Workspace"
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2 min-w-0 w-full">
                <Plus className="h-5 w-5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate min-w-0">Create Workspace</span>
              </span>
            </SidebarMenuButton>
            <SidebarMenuButton
              isActive={false}
              onClick={() => showAddProjectModal({})}
              aria-label="Add Project"
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2 min-w-0 w-full">
                <FolderPlus className="h-5 w-5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate min-w-0">Add Project</span>
              </span>
              <ShortcutHint settingsKey="newProject" />
            </SidebarMenuButton>
            <SidebarMenuButton
              isActive={isCurrentView(currentView, 'skills')}
              onClick={() => navigate('skills')}
              aria-label="Skills"
              className="w-full justify-start"
            >
              <Puzzle className="h-5 w-5 sm:h-4 sm:w-4" />
              Skills
            </SidebarMenuButton>
            <SidebarMenuButton
              isActive={isCurrentView(currentView, 'mcp')}
              onClick={() => navigate('mcp')}
              aria-label="MCP"
              className="w-full justify-start"
            >
              <Plug className="h-5 w-5 sm:h-4 sm:w-4" />
              MCP
            </SidebarMenuButton>
            <SidebarMenuButton
              isActive={isCurrentView(currentView, 'settings')}
              onClick={() => navigate('settings')}
              aria-label="Settings"
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-5 w-5 sm:h-4 sm:w-4" />
                Settings
              </span>
              <ShortcutHint settingsKey="settings" />
            </SidebarMenuButton>
          </SidebarMenu>
        </SidebarFooter>
        <div className="flex items-center gap-2 justify-between px-3 py-2 border-t border-border">
          <button
            type="button"
            className="flex h-6 items-center min-w-0 w-full cursor-pointer gap-2 rounded-lg px-3 text-sm text-foreground-muted focus:outline-none focus-visible:outline-none"
            onClick={() => showFeedbackModal({})}
          >
            <MessageSquareShare className="size-4 shrink-0" />
            <span className="truncate">Give feedback</span>
          </button>
          <UpdateSection />
        </div>
      </SidebarContainer>
    </div>
  );
});

import { Home, PanelLeft } from 'lucide-react';
import { useWorkspaceLayoutContext } from '@renderer/lib/layout/layout-provider';
import {
  isCurrentView,
  useNavigate,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { Toggle } from '@renderer/lib/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';

export function SidebarSpace() {
  const { isLeftOpen, setCollapsed } = useWorkspaceLayoutContext();
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();

  return (
    <div className="[-webkit-app-region:drag] flex h-10 w-full items-center justify-between px-2">
      {!isCurrentView(currentView, 'home') && (
        <Tooltip>
          <TooltipTrigger>
            <Toggle
              className="[-webkit-app-region:no-drag] size-7 bg-background-tertiary-3 hover:bg-background-tertiary-3 data-pressed:bg-background-tertiary-2"
              variant="outline"
              size="sm"
              onPressedChange={() => navigate('home')}
            >
              <Home className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Go to workspace list</TooltipContent>
        </Tooltip>
      )}
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger>
          <Toggle
            className="[-webkit-app-region:no-drag] size-7 bg-background-tertiary-3 hover:bg-background-tertiary-3 data-pressed:bg-background-tertiary-2"
            variant="outline"
            size="sm"
            pressed={isLeftOpen}
            onPressedChange={() => setCollapsed('left', isLeftOpen)}
          >
            <PanelLeft />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          Toggle left sidebar
          <ShortcutHint settingsKey="toggleLeftSidebar" />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

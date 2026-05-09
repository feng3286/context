import { Pin } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { sidebarStore } from '@renderer/lib/stores/app-state';
import { SidebarGroup, SidebarMenu } from './sidebar-primitives';
import { SidebarTaskItem } from './task-item';

export const SidebarPinnedTaskList = observer(function SidebarPinnedTaskList() {
  const entries = sidebarStore.pinnedSidebarEntries;
  if (entries.length === 0) return null;

  return (
    <SidebarGroup className="shrink-0 flex flex-col border-b border-border/30 pb-2">
      <div className="flex items-center gap-1.5 px-3 py-1.5 h-7">
        <Pin className="h-3 w-3 text-foreground-tertiary-muted" />
        <span className="text-[11px] font-semibold text-foreground-tertiary-muted uppercase tracking-widest">
          Pinned
        </span>
      </div>
      <SidebarMenu className="px-1">
        {entries.map(({ projectId, taskId }) => (
          <SidebarTaskItem
            key={`${projectId}:${taskId}`}
            projectId={projectId}
            taskId={taskId}
            rowVariant="pinned"
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
});

import { observer } from 'mobx-react-lite';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/lib/ui/resizable';
import { cn } from '@renderer/utils/utils';
import { GitStatusSection } from './git-status-section';
import { SECTION_HEADER_HEIGHT, usePanelLayout } from './hooks/use-panel-layout';
import { PullRequestsSection } from './pr-section';
import { ProjectChangesSection } from './project-changes-section';
import { StagedSection } from './staged-section';
import { UnstagedSection } from './unstaged-section';

/**
 * Changes panel for single-project tasks.
 * Uses resizable panels for staged/unstaged/PR sections.
 */
const SingleProjectChangesPanel = observer(function SingleProjectChangesPanel() {
  const provisioned = useProvisionedTask();
  const changesView = provisioned.taskView.diffView.changesView;

  const {
    expanded,
    toggleExpanded,
    panelTransitionClass,
    pointerHandlers,
    unstagedRef,
    stagedRef,
    prRef,
    spacerRef,
  } = usePanelLayout(changesView);

  if (!provisioned.workspace.git.hasData) return null;

  return (
    <div className="flex h-full flex-col">
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
        id="changes-panel-group"
        disableCursor
      >
        <ResizablePanel
          id="changes-unstaged"
          panelRef={unstagedRef}
          collapsible
          collapsedSize={SECTION_HEADER_HEIGHT}
          minSize="150px"
          maxSize="100%"
          defaultSize="33%"
          className={cn('flex flex-col overflow-hidden', panelTransitionClass)}
        >
          <UnstagedSection />
        </ResizablePanel>
        <ResizableHandle disabled={!expanded.unstaged || !expanded.staged} {...pointerHandlers} />
        <ResizablePanel
          id="changes-staged"
          panelRef={stagedRef}
          collapsible
          collapsedSize={SECTION_HEADER_HEIGHT}
          minSize="150px"
          maxSize="100%"
          defaultSize="33%"
          className={cn('flex flex-col overflow-hidden', panelTransitionClass)}
        >
          <StagedSection />
        </ResizablePanel>
        <ResizableHandle
          disabled={!expanded.staged || !expanded.pullRequests}
          {...pointerHandlers}
        />
        <ResizablePanel
          id="changes-pr"
          panelRef={prRef}
          collapsible
          collapsedSize={SECTION_HEADER_HEIGHT}
          minSize="150px"
          maxSize="100%"
          defaultSize="33%"
          className={cn('flex flex-col overflow-hidden', panelTransitionClass)}
        >
          <PullRequestsSection
            onToggleCollapsed={() => toggleExpanded('pullRequests')}
            collapsed={!expanded.pullRequests}
          />
        </ResizablePanel>
        <ResizablePanel
          id="changes-spacer"
          panelRef={spacerRef}
          minSize="0%"
          maxSize="100%"
          defaultSize="0%"
          className="border-t border-border"
        />
      </ResizablePanelGroup>
      <GitStatusSection />
    </div>
  );
});

/**
 * Changes panel for multi-project tasks.
 * Groups changes by project with collapsible sections.
 */
const MultiProjectChangesPanel = observer(function MultiProjectChangesPanel() {
  const provisioned = useProvisionedTask();
  const projectContexts = provisioned.projectContexts;

  if (!projectContexts) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading project contexts...
      </div>
    );
  }

  const projects = Array.from(projectContexts.projects.values());

  if (projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No projects found
      </div>
    );
  }

  // Check if any project has git data
  const hasAnyData = projects.some((p) => p.git.hasData);
  if (!hasAnyData) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading git status...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Project sections - scrollable */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {projects.map((projectContext) => (
          <ProjectChangesSection key={projectContext.projectId} projectContext={projectContext} />
        ))}
      </div>

      {/* PR section for the workspace - shown at bottom for multi-project */}
      {provisioned.workspace.pr.pullRequests.length > 0 && (
        <div className="shrink-0 border-t border-border">
          <PullRequestsSection
            collapsed={!provisioned.taskView.diffView.changesView.expandedSections.pullRequests}
            onToggleCollapsed={() =>
              provisioned.taskView.diffView.changesView.toggleExpanded('pullRequests')
            }
          />
        </div>
      )}

      {/* Git status */}
      <GitStatusSection />
    </div>
  );
});

/**
 * Changes panel that switches between single-project and multi-project layouts.
 */
export const ChangesPanel = observer(function ChangesPanel() {
  const provisioned = useProvisionedTask();

  // Use multi-project layout if this is a multi-project task
  if (provisioned.isMultiProject && provisioned.projectContexts) {
    return <MultiProjectChangesPanel />;
  }

  return <SingleProjectChangesPanel />;
});
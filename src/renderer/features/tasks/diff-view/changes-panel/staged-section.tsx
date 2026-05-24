import { ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { commitRef, HEAD_REF } from '@shared/git';
import type { GitStore } from '@renderer/features/tasks/diff-view/stores/git-store';
import type { ProjectChangesViewStore } from '@renderer/features/tasks/stores/project-changes-view-store';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { cn } from '@renderer/utils/utils';
import { ActionCard } from './components/action-card';
import { CommitCard } from './components/commit-card';
import { VirtualizedChangesList } from './components/virtualized-changes-list';
import { usePrefetchDiffModels } from './hooks/use-prefetch-diff-models';

interface StagedSectionProps {
  /** Optional git store override for multi-project mode */
  gitOverride?: GitStore;
  /** Optional project ID override for multi-project mode */
  projectIdOverride?: string;
  /** Optional changes view store override for multi-project mode */
  changesViewOverride?: ProjectChangesViewStore;
  /** Hide commit card - useful for multi-project mode where commits are managed separately */
  hideCommitCard?: boolean;
}

export const StagedSection = observer(function StagedSection({
  gitOverride,
  projectIdOverride,
  changesViewOverride,
  hideCommitCard = false,
}: StagedSectionProps) {
  const { projectId: contextProjectId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const projectId = projectIdOverride ?? contextProjectId;
  const git = gitOverride ?? provisioned.workspace.git;
  const changesView = provisioned.taskView.diffView.changesView;
  const diffView = provisioned.taskView.diffView;

  // Use project-specific changes view if provided (multi-project mode)
  const effectiveChangesView = changesViewOverride ?? changesView;

  const changes = git.stagedFileChanges;
  const hasChanges = changes.length > 0;
  const selectedPaths = effectiveChangesView.stagedSelection;
  const selectionState =
    selectedPaths.size === 0 ? 'none' : selectedPaths.size === changes.length ? 'all' : 'partial';

  const activePath =
    provisioned.taskView.view === 'diff' && diffView.activeFile?.group === 'staged'
      ? diffView.activeFile.path
      : undefined;

  const prefetch = usePrefetchDiffModels(projectId, provisioned.workspaceId, 'staged', HEAD_REF);

  const handleSelectChange = (path: string) => {
    diffView.setActiveFile({
      path,
      type: 'git',
      group: 'staged',
      originalRef: commitRef('HEAD'),
      projectId: projectIdOverride ?? undefined,
    });
    provisioned.taskView.setView('diff');
    // In multi-project mode, expand the current project's section
    if (changesViewOverride && !effectiveChangesView.expandedStaged) {
      effectiveChangesView.expandedStaged = true;
    }
  };

  const handleUnstageSelection = () => {
    const paths = [...selectedPaths];
    void git.unstageFiles(paths);
    effectiveChangesView.clearStagedSelection();
  };

  const handleUnstageAll = () => {
    void git.unstageAllFiles();
  };

  const expanded = changesViewOverride
    ? changesViewOverride.expandedStaged
    : changesView.expandedStaged;

  return (
    <div className={cn('flex flex-col border-b border-border', expanded && 'flex-1 min-h-0')}>
      {/* Section header - always visible */}
      <div
        className="shrink-0 flex items-center justify-between px-2.5 h-9 cursor-pointer hover:bg-background-1"
        onClick={() => effectiveChangesView.toggleExpanded('staged')}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="text-sm text-foreground-muted">Staged</span>
          <Badge variant="secondary">{changes.length}</Badge>
        </div>
        <Checkbox
          checked={selectionState === 'all'}
          indeterminate={selectionState === 'partial'}
          onCheckedChange={() => {
            if (selectionState === 'all') {
              effectiveChangesView.clearStagedSelection();
            } else {
              for (const c of changes) {
                effectiveChangesView.stagedSelection.add(c.path);
              }
            }
          }}
          aria-label="Select all staged files"
          className="mr-0.5"
        />
      </div>

      {/* Content - only visible when expanded */}
      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!hasChanges && (
            <EmptyState
              label="Nothing staged"
              description="Stage files above to include them in a commit."
            />
          )}
          {hasChanges && selectedPaths.size > 0 && (
            <ActionCard
              selectedCount={selectedPaths.size}
              selectionActions={
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleUnstageSelection}
                  title="Unstage selected files"
                >
                  <Minus className="size-3" />
                  Unstage
                </Button>
              }
              generalActions={
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={!hasChanges}
                  onClick={handleUnstageAll}
                  title="Unstage all files"
                >
                  <Minus className="size-3" />
                  Unstage all
                </Button>
              }
            />
          )}
          <div className="min-h-0 flex-1 px-1">
            <VirtualizedChangesList
              changes={changes}
              isSelected={(path) => selectedPaths.has(path)}
              onToggleSelect={(path) => effectiveChangesView.toggleStagedItem(path)}
              activePath={activePath}
              onSelectChange={(change) => handleSelectChange(change.path)}
              onPrefetch={(change) => prefetch(change.path)}
            />
          </div>
          {hasChanges && !hideCommitCard && <CommitCard />}
        </div>
      )}
    </div>
  );
});

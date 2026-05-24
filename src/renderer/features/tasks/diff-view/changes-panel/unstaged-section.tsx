import { ChevronDown, ChevronRight, Plus, Undo2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { commitRef, HEAD_REF } from '@shared/git';
import type { ChangesViewStore } from '@renderer/features/tasks/diff-view/stores/changes-view-store';
import type { GitStore } from '@renderer/features/tasks/diff-view/stores/git-store';
import type { ProjectChangesViewStore } from '@renderer/features/tasks/stores/project-changes-view-store';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { cn } from '@renderer/utils/utils';
import { ActionCard } from './components/action-card';
import { CommitCard } from './components/commit-card';
import { VirtualizedChangesList } from './components/virtualized-changes-list';
import { usePrefetchDiffModels } from './hooks/use-prefetch-diff-models';

interface UnstagedSectionProps {
  /** Optional git store override for multi-project mode */
  gitOverride?: GitStore;
  /** Optional project ID override for multi-project mode */
  projectIdOverride?: string;
  /** Optional changes view store override for multi-project mode */
  changesViewOverride?: ProjectChangesViewStore;
  /** Hide commit card - useful for multi-project mode where commits are managed separately */
  hideCommitCard?: boolean;
}

export const UnstagedSection = observer(function UnstagedSection({
  gitOverride,
  projectIdOverride,
  changesViewOverride,
  hideCommitCard = false,
}: UnstagedSectionProps) {
  const { projectId: contextProjectId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const projectId = projectIdOverride ?? contextProjectId;
  const git = gitOverride ?? provisioned.workspace.git;
  const changesView = provisioned.taskView.diffView.changesView;
  const diffView = provisioned.taskView.diffView;

  // Use project-specific changes view if provided (multi-project mode)
  const effectiveChangesView = changesViewOverride ?? changesView;

  const changes = git.unstagedFileChanges;
  const hasChanges = changes.length > 0;
  const hasStagedChanges = git.stagedFileChanges.length > 0;
  const selectedPaths = effectiveChangesView.unstagedSelection;
  const selectionState =
    selectedPaths.size === 0 ? 'none' : selectedPaths.size === changes.length ? 'all' : 'partial';

  const activePath =
    provisioned.taskView.view === 'diff' && diffView.activeFile?.group === 'disk'
      ? diffView.activeFile.path
      : undefined;

  const prefetch = usePrefetchDiffModels(projectId, provisioned.workspaceId, 'disk', HEAD_REF);

  const showConfirmActionModal = useShowModal('confirmActionModal');

  const handleSelectChange = (path: string) => {
    diffView.setActiveFile({
      path,
      type: 'disk',
      group: 'disk',
      originalRef: commitRef('HEAD'),
      projectId: projectIdOverride ?? undefined,
    });
    provisioned.taskView.setView('diff');
    // In multi-project mode, expand the current project's section
    if (changesViewOverride && !effectiveChangesView.expandedUnstaged) {
      effectiveChangesView.expandedUnstaged = true;
    }
  };

  const handleDiscardSelection = () => {
    const paths = [...selectedPaths];
    showConfirmActionModal({
      title: 'Discard Files Changes',
      variant: 'destructive',
      description:
        'Are you sure you want to discard the changes to the selected files? This can not be undone.',
      onSuccess: async () => {
        await git.discardFiles(paths);
        effectiveChangesView.clearUnstagedSelection();
      },
    });
  };

  const handleDiscardAll = () => {
    showConfirmActionModal({
      title: 'Discard All Changes',
      variant: 'destructive',
      description: 'Are you sure you want to discard all changes? This can not be undone.',
      onSuccess: async () => {
        await git.discardAllFiles();
      },
    });
  };

  const handleStageSelection = () => {
    const paths = [...selectedPaths];
    void git.stageFiles(paths);
    effectiveChangesView.clearUnstagedSelection();
  };

  const handleStageAll = () => {
    void git.stageAllFiles();
  };

  const expanded = changesViewOverride
    ? changesViewOverride.expandedUnstaged
    : changesView.expandedUnstaged;

  return (
    <div className={cn('flex flex-col border-b border-border', expanded && 'flex-1 min-h-0')}>
      {/* Section header - always visible */}
      <div
        className="shrink-0 flex items-center justify-between px-2.5 h-9 cursor-pointer hover:bg-background-1"
        onClick={() => effectiveChangesView.toggleExpanded('unstaged')}
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
          <span className="text-sm text-foreground-muted">Changed</span>
          <Badge variant="secondary">{changes.length}</Badge>
        </div>
        <Checkbox
          checked={selectionState === 'all'}
          indeterminate={selectionState === 'partial'}
          onCheckedChange={() => {
            if (selectionState === 'all') {
              effectiveChangesView.clearUnstagedSelection();
            } else {
              for (const c of changes) {
                effectiveChangesView.unstagedSelection.add(c.path);
              }
            }
          }}
          aria-label="Select all changed files"
          className="mr-0.5"
        />
      </div>

      {/* Content - only visible when expanded */}
      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!hasChanges && (
            <EmptyState label="Working tree clean" description="No uncommitted file changes." />
          )}
          {hasChanges && (
            <ActionCard
              selectedCount={selectedPaths.size}
              selectionActions={
                <>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={handleDiscardSelection}
                    title="Discard selected files"
                    className="text-foreground-destructive"
                  >
                    <Undo2 className="size-3" />
                    Discard
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleStageSelection}
                    title="Stage selected files"
                  >
                    <Plus className="size-3" />
                    Stage
                  </Button>
                </>
              }
              generalActions={
                <>
                  <Button
                    variant="link"
                    size="xs"
                    disabled={!hasChanges}
                    onClick={handleDiscardAll}
                    title="Discard all changes"
                    className="text-foreground-destructive"
                  >
                    <Undo2 className="size-3" />
                    Discard all
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={!hasChanges}
                    onClick={handleStageAll}
                    title="Stage all changes"
                  >
                    <Plus className="size-3" />
                    Stage all
                  </Button>
                </>
              }
            />
          )}
          <div className="min-h-0 flex-1 px-1">
            <VirtualizedChangesList
              changes={changes}
              isSelected={(path) => selectedPaths.has(path)}
              onToggleSelect={(path) => effectiveChangesView.toggleUnstagedItem(path)}
              activePath={activePath}
              onSelectChange={(change) => handleSelectChange(change.path)}
              onPrefetch={(change) => prefetch(change.path)}
            />
          </div>
          {hasChanges && !hasStagedChanges && !hideCommitCard && <CommitCard autoStage />}
        </div>
      )}
    </div>
  );
});

import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import type { ProjectContext } from '@renderer/features/tasks/stores/project-context-store';
import { StagedSection } from './staged-section';
import { UnstagedSection } from './unstaged-section';
import { cn } from '@renderer/utils/utils';

interface ProjectChangesSectionProps {
  projectContext: ProjectContext;
}

/**
 * Per-project changes section for multi-project tasks.
 * Shows project header with collapsible staged/unstaged changes.
 */
export const ProjectChangesSection = observer(function ProjectChangesSection({
  projectContext,
}: ProjectChangesSectionProps) {
  const provisioned = useProvisionedTask();
  const projectContexts = provisioned.projectContexts;

  if (!projectContexts) return null;

  const expanded = projectContexts.isExpanded(projectContext.projectId);
  const git = projectContext.git;

  const stagedCount = git.stagedFileChanges.length;
  const unstagedCount = git.unstagedFileChanges.length;
  const totalChanges = stagedCount + unstagedCount;

  // Don't render empty project sections
  if (!git.hasData || totalChanges === 0) return null;

  return (
    <div className="flex flex-col border-b border-border last:border-b-0">
      {/* Project header */}
      <div
        className={cn(
          'flex h-9 cursor-pointer select-none items-center gap-1.5 px-2 hover:bg-background-1',
          'shrink-0'
        )}
        onClick={() => projectContexts.toggleSection(projectContext.projectId)}
        role="button"
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="shrink-0">
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {projectContext.projectName}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Project changes content */}
      {expanded && (
        <div className="flex min-h-0 flex-col overflow-hidden">
          {/* Unstaged section for this project */}
          <div className="flex min-h-0 flex-col border-b border-border/50">
            <UnstagedSection
              gitOverride={git}
              projectIdOverride={projectContext.projectId}
              hideCommitCard
            />
          </div>

          {/* Staged section for this project */}
          <div className="flex min-h-0 flex-col">
            <StagedSection
              gitOverride={git}
              projectIdOverride={projectContext.projectId}
              hideCommitCard
            />
          </div>
        </div>
      )}
    </div>
  );
});
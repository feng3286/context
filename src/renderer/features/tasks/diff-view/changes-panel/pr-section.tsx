import { ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { getPrSyncStore } from '@renderer/features/projects/stores/project-selectors';
import { rpc } from '@renderer/lib/ipc';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { useProvisionedTask, useTaskViewContext } from '../../task-view-context';
import { PullRequestEntry } from './components/pr-entry/pr-entry';

export const PullRequestsSection = observer(function PullRequestsSection({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const { projectId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const { pr } = provisioned.workspace;
  const repositoryUrl = provisioned.repositoryStore.repositoryUrl;
  const taskBranch = provisioned.taskBranch;
  const { pullRequests, currentPr } = pr;
  const showCreatePrModal = useShowModal('createPrModal');

  const hasOpenPr = pullRequests.some((p) => p.status === 'open');
  const isRefreshing = repositoryUrl
    ? (getPrSyncStore(projectId)?.isSyncing(repositoryUrl) ?? false)
    : false;

  return (
    <div className={cn('flex flex-col border-b border-border', !collapsed && 'flex-1 min-h-0')}>
      {/* Section header - always visible */}
      <div
        className="shrink-0 flex items-center justify-between px-2.5 h-9 cursor-pointer hover:bg-background-1"
        onClick={onToggleCollapsed}
        role="button"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground">
            {!collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="text-sm text-foreground-muted">{t('git:pr.title')}</span>
          <Badge variant="secondary">{pullRequests.length}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  taskBranch &&
                    showCreatePrModal({
                      nameWithOwner: repositoryUrl ?? '',
                      branchName: taskBranch,
                      draft: false,
                      workspaceId: provisioned.workspaceId,
                      onSuccess: () => {},
                    });
                }}
                disabled={hasOpenPr}
              >
                <Plus className="size-3" />
                {t('git:pr.createPR')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasOpenPr ? t('git:pr.prAlreadyOpen') : t('git:pr.createPRTooltip')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  void rpc.pullRequests.syncPullRequests(projectId);
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('git:pr.refreshTooltip')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content - only visible when expanded */}
      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!repositoryUrl ? (
            <EmptyState label={t('git:pr.unavailable')} description={t('git:pr.unavailableDesc')} />
          ) : pullRequests.length === 0 ? (
            <EmptyState label={t('git:pr.noPRs')} description={t('git:pr.noPRsDesc')} />
          ) : null}
          {repositoryUrl && currentPr && <PullRequestEntry key={currentPr.url} pr={currentPr} />}
        </div>
      )}
    </div>
  );
});

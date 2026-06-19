import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileDiff,
  Files,
  GitBranch,
  GitCommit,
  Link,
  ListTree,
  MessageSquare,
  Pin,
  RefreshCcw,
  Terminal,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback } from 'react';
import {
  asMounted,
  getProjectStore,
  projectDisplayName,
} from '@renderer/features/projects/stores/project-selectors';
import {
  getRegisteredTaskData,
  getTaskStore,
  taskDisplayName,
  taskViewKind,
} from '@renderer/features/tasks/stores/task-selectors';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { RightPanelView } from '@renderer/features/tasks/types';
import { getWorkspaceStore } from '@renderer/features/workspaces/stores/workspace-selectors';
import {
  OpenInMenu,
  type OpenInProjectOption,
} from '@renderer/lib/components/titlebar/open-in-menu';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { getActiveEditorPosition } from '@renderer/lib/editor/activeCodeEditor';
import { useDelayedBoolean } from '@renderer/lib/hooks/use-delay-boolean';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { MicroLabel } from '@renderer/lib/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { DevServerPills } from './components/dev-server-pills';
import { IssueSelector } from './components/issue-selector/issue-selector';
import { useTaskViewNavigation } from './hooks/use-task-view-navigation';
import { useTaskViewShortcuts } from './hooks/use-task-view-shortcuts';
import { useGitActions } from './use-git-actions';

/**
 * Get the display name for the task's project context.
 * For single-project tasks: returns the project name.
 * For multi-project tasks: returns the workspace name with project count.
 */
function getTaskProjectDisplayName(
  projectId: string,
  provisionedTask: ReturnType<typeof useProvisionedTask>
): string {
  if (provisionedTask.isMultiProject && provisionedTask._taskData.workspaceId) {
    const workspaceStore = getWorkspaceStore(provisionedTask._taskData.workspaceId);
    const workspaceName = workspaceStore?.data?.name ?? 'Workspace';
    const projectCount = provisionedTask.projectContexts?.projects.size ?? 0;
    return projectCount > 1 ? `${workspaceName} (${projectCount})` : workspaceName;
  }
  return projectDisplayName(getProjectStore(projectId)) ?? 'Project';
}

/** Single-project git actions section inside the popover. */
const ProjectGitActions = observer(function ProjectGitActions({
  projectId,
  taskId,
  provisionedTask,
}: {
  projectId: string;
  taskId: string;
  provisionedTask: ReturnType<typeof useProvisionedTask>;
}) {
  const {
    hasUpstream,
    aheadCount,
    behindCount,
    fetch,
    pull,
    push,
    publish,
    isPublishing,
    isFetching,
    isPulling,
    isPushing,
  } = useGitActions(projectId, taskId);

  const ctx = provisionedTask.projectContexts?.projects.get(projectId);
  const branchName = provisionedTask.workspace.git.branchName;

  return (
    <div className="flex flex-col gap-1 border border-border rounded-md p-2">
      <span className="flex items-center gap-1 text-foreground-muted">
        <GitBranch className="size-3.5" />
        <span>{branchName}</span>
      </span>
      {ctx?.sourceBranch && (
        <span className="flex items-center gap-2 text-foreground-passive">
          Created from
          <span className="flex items-center gap-1 text-foreground-muted">
            <GitBranch className="size-3.5" /> {ctx.sourceBranch}
          </span>
        </span>
      )}
      <div className="flex items-center gap-1 w-full">
        {hasUpstream ? (
          <>
            <Tooltip>
              <TooltipTrigger className="flex-1">
                <Button
                  className="w-full"
                  variant="outline"
                  size="xs"
                  disabled={isFetching}
                  onClick={() => fetch()}
                >
                  <RefreshCcw className="size-3" />
                  {isFetching ? 'Fetching...' : 'Fetch'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFetching ? 'Fetching...' : 'Fetch changes'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger className="flex-1">
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={isPulling || behindCount === 0}
                  size="xs"
                  onClick={() => pull()}
                >
                  <ArrowDown className="size-3" />
                  {isPulling ? (
                    'Pulling...'
                  ) : (
                    <span className="flex items-center gap-1">
                      Pull
                      <Badge variant="secondary" className="shrink-0">
                        {behindCount}
                      </Badge>
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPulling ? 'Pulling...' : behindCount === 0 ? 'Nothing to pull' : 'Pull changes'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger className="flex-1">
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={isPushing || aheadCount === 0}
                  size="xs"
                  onClick={() => push()}
                >
                  <ArrowUp className="size-3" />
                  {isPushing ? (
                    'Pushing...'
                  ) : (
                    <span className="flex items-center gap-1">
                      Push
                      <Badge variant="secondary" className="shrink-0">
                        {aheadCount}
                      </Badge>
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPushing ? 'Pushing...' : aheadCount === 0 ? 'Nothing to push' : 'Push changes'}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger className="flex-1">
              <Button
                className="w-full"
                variant="outline"
                disabled={isPublishing}
                size="xs"
                onClick={() => publish()}
              >
                <ArrowUp className="size-3" />
                {isPublishing ? 'Publishing...' : 'Publish'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPublishing ? 'Publishing...' : 'Publish branch'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});

/** Multi-project git actions sections inside the popover. */
const MultiProjectGitSections = observer(function MultiProjectGitSections({
  provisionedTask,
}: {
  provisionedTask: ReturnType<typeof useProvisionedTask>;
}) {
  if (!provisionedTask.isMultiProject || !provisionedTask.projectContexts) return null;

  return (
    <>
      {Array.from(provisionedTask.projectContexts.projects.values()).map((projectContext) => (
        <div
          key={projectContext.projectId}
          className="flex flex-col gap-1 border border-border rounded-md p-2"
        >
          <span className="flex items-center gap-1 text-foreground-muted">
            <Files className="size-3.5" />
            <span className="font-medium">{projectContext.projectName}</span>
          </span>
          {projectContext.git.hasData && projectContext.git.branchName && (
            <span className="flex items-center gap-1 text-foreground-muted">
              <GitBranch className="size-3.5" />
              <span>{projectContext.git.branchName}</span>
            </span>
          )}
          {projectContext.sourceBranch && (
            <span className="flex items-center gap-2 text-foreground-passive">
              Created from
              <span className="flex items-center gap-1 text-foreground-muted">
                <GitBranch className="size-3.5" /> {projectContext.sourceBranch}
              </span>
            </span>
          )}
          <div className="flex items-center gap-1 w-full">
            {projectContext.git.isBranchPublished ? (
              <>
                <Tooltip>
                  <TooltipTrigger className="flex-1">
                    <Button
                      className="w-full"
                      variant="outline"
                      size="xs"
                      disabled={!projectContext.git.hasData}
                      onClick={() => projectContext.git.fetchRemote()}
                    >
                      <RefreshCcw className="size-3" />
                      Fetch
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fetch changes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger className="flex-1">
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={projectContext.git.behindCount === 0}
                      size="xs"
                      onClick={() => projectContext.git.pull()}
                    >
                      <ArrowDown className="size-3" />
                      <span className="flex items-center gap-1">
                        Pull
                        <Badge variant="secondary" className="shrink-0">
                          {projectContext.git.behindCount}
                        </Badge>
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {projectContext.git.behindCount === 0 ? 'Nothing to pull' : 'Pull changes'}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger className="flex-1">
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={projectContext.git.aheadCount === 0}
                      size="xs"
                      onClick={() => projectContext.git.push()}
                    >
                      <ArrowUp className="size-3" />
                      <span className="flex items-center gap-1">
                        Push
                        <Badge variant="secondary" className="shrink-0">
                          {projectContext.git.aheadCount}
                        </Badge>
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {projectContext.git.aheadCount === 0 ? 'Nothing to push' : 'Push changes'}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger className="flex-1">
                  <Button
                    className="w-full"
                    variant="outline"
                    size="xs"
                    onClick={() => projectContext.git.publishBranch()}
                  >
                    <ArrowUp className="size-3" />
                    Publish
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Publish branch</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      ))}
    </>
  );
});

/** View toggle group (agents / diff / editor). */
function ViewToggleGroup({ delayedIsPending }: { delayedIsPending: boolean }) {
  const { openAgentsView, openEditorView, openDiffView } = useTaskViewNavigation();
  const provisionedTask = useProvisionedTask();
  const { view } = provisionedTask.taskView;

  const handleValueChange = useCallback(
    ([value]: string[]) => {
      if (value === 'agents') openAgentsView();
      if (value === 'editor') openEditorView();
      if (value === 'diff') openDiffView();
    },
    [openAgentsView, openEditorView, openDiffView]
  );

  return (
    <ToggleGroup
      disabled={delayedIsPending}
      variant="outline"
      value={[view]}
      size="sm"
      onValueChange={handleValueChange}
    >
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="agents" size="sm">
            <MessageSquare className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            <span>Conversations view</span>
            <ShortcutHint settingsKey="taskViewAgents" />
          </div>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="diff" size="sm">
            <FileDiff className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            <span>Diff view</span>
            <ShortcutHint settingsKey="taskViewDiff" />
          </div>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="editor" size="sm">
            <Files className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            <span>File view</span>
            <ShortcutHint settingsKey="taskViewEditor" />
          </div>
        </TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
}

/** Right panel toggle group (changes / terminals / files). */
const RightPanelToggleGroup = observer(function RightPanelToggleGroup({
  delayedIsPending,
}: {
  delayedIsPending: boolean;
}) {
  const provisionedTask = useProvisionedTask();
  const { rightPanelView } = provisionedTask.taskView;

  const handleValueChange = useCallback(
    ([value]: string[]) => {
      if (!value) return;
      provisionedTask.taskView.setRightPanelView(value as RightPanelView);
    },
    [provisionedTask.taskView]
  );

  return (
    <ToggleGroup
      disabled={delayedIsPending}
      variant="outline"
      value={[rightPanelView]}
      size="sm"
      onValueChange={handleValueChange}
    >
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="changes" size="sm">
            <GitCommit className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Git changes</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="terminals" size="sm">
            <Terminal className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Terminals</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <ToggleGroupItem value="files" size="sm">
            <ListTree className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>File explorer</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
});

export const TaskTitlebar = observer(function TaskTitlebar() {
  const { projectId, taskId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);

  if (kind !== 'ready') {
    return <PendingTaskTitlebar taskId={taskId} projectId={projectId} />;
  }

  return <ActiveTaskTitlebar taskId={taskId} projectId={projectId} />;
});

const PendingTaskTitlebar = observer(function PendingTaskTitlebar({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const taskStore = getTaskStore(projectId, taskId);
  if (!taskStore) return null;
  const name = taskDisplayName(taskStore);

  // Check if this is a multi-project task directly from taskStore.data
  const taskData = taskStore.state !== 'unregistered' ? taskStore.data : null;
  const isMultiProject = taskData && 'workspaceId' in taskData && taskData.workspaceId;

  let projectName: string;
  if (isMultiProject && taskData?.workspaceId) {
    const workspaceStore = getWorkspaceStore(taskData.workspaceId);
    projectName = workspaceStore?.data?.name ?? 'Workspace';
  } else {
    projectName = projectDisplayName(getProjectStore(projectId)) ?? 'Project';
  }

  return (
    <Titlebar
      leftSlot={
        <div className="flex items-center gap-1 px-2 text-sm text-foreground-muted">
          <span className="flex items-center gap-1">
            <span className="text-sm text-foreground-passive">{projectName}</span>
            <span className="text-sm text-foreground-passive">/</span>
            {name}
          </span>
        </div>
      }
    />
  );
});

const ActiveTaskTitlebar = observer(function ActiveTaskTitlebar({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const taskStore = getTaskStore(projectId, taskId)!;
  const taskPayload = getRegisteredTaskData(projectId, taskId)!;
  const provisionedTask = useProvisionedTask();
  const { delayedIsPending } = useTitlebarState();
  const showModal = useShowModal('manageTaskProjectsModal');
  useTaskViewShortcuts();

  const projectStore = asMounted(getProjectStore(projectId));
  const projectName = getTaskProjectDisplayName(projectId, provisionedTask);
  const isRemoteProject = projectStore?.data.type === 'ssh';

  const activeFilePath = useActiveFilePath();
  const activeFileProjectId = useActiveFileProjectId();
  const activeLineNumber = useActiveLineNumber(activeFilePath);
  const activeProjectWorktreePath = useWorktreePath(activeFileProjectId);
  const projectOptions = useProjectOptions();

  return (
    <Titlebar
      leftSlot={
        <div className="flex items-center gap-1 px-2">
          <Popover>
            <PopoverTrigger className="flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
              <span className="flex items-center gap-1">
                <span className="text-sm text-foreground-passive">{projectName}</span>
                <span className="text-sm text-foreground-passive">/</span>
                {taskDisplayName(taskStore)}
              </span>
              <ChevronDown className="size-3.5 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-96 p-4 flex flex-col gap-2">
              <div className="flex flex-col gap-1 w-full">
                <MicroLabel className="text-foreground-passive items-center flex">Task</MicroLabel>
                <span className="text-sm tracking-tight">{taskDisplayName(taskStore)}</span>
              </div>
              {provisionedTask.isMultiProject && provisionedTask.projectContexts ? (
                <MultiProjectGitSections provisionedTask={provisionedTask} />
              ) : (
                <ProjectGitActions
                  projectId={projectId}
                  taskId={taskId}
                  provisionedTask={provisionedTask}
                />
              )}
              <IssueSelector
                value={taskPayload.linkedIssue ?? null}
                onValueChange={(issue) => {
                  taskStore.updateLinkedIssue(issue ?? undefined);
                }}
                projectId={projectId}
                nameWithOwner={provisionedTask.repositoryStore.repositoryUrl ?? ''}
                projectPath={provisionedTask.path}
              />
            </PopoverContent>
          </Popover>
          <button
            className={cn(
              'text-foreground-muted ml-1',
              taskPayload.isPinned && 'text-muted-foreground'
            )}
            onClick={() => taskStore.setPinned(!taskPayload.isPinned)}
          >
            <Pin
              className={cn('size-3.5', taskPayload.isPinned && 'text-foreground-muted')}
              fill={taskPayload.isPinned ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      }
      rightSlot={
        <div className="flex items-center gap-2 mr-2">
          <DevServerPills projectId={projectId} taskId={taskId} />
          {!isRemoteProject && (
            <OpenInMenu
              path={activeProjectWorktreePath}
              filePath={activeFilePath}
              lineNumber={activeLineNumber}
              projectId={activeFileProjectId}
              projectOptions={projectOptions}
              className="h-7 bg-background"
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1"
            onClick={() => showModal({ taskId, projectId })}
          >
            <Link className="size-3.5" />
            <span className="text-xs">关联项目</span>
          </Button>
          <ViewToggleGroup delayedIsPending={delayedIsPending} />
          <RightPanelToggleGroup delayedIsPending={delayedIsPending} />
        </div>
      }
    />
  );
});

// ── Extracted hooks for ActiveTaskTitlebar computed values ───────────────────

function useTitlebarState() {
  const { isPending } = useTaskViewNavigation();
  const delayedIsPending = useDelayedBoolean(isPending, 200);
  return { delayedIsPending };
}

function useActiveFilePath(): string | undefined {
  const provisionedTask = useProvisionedTask();
  const { view } = provisionedTask.taskView;
  return view === 'editor'
    ? (provisionedTask.taskView.editorView.activeFilePath ?? undefined)
    : view === 'diff'
      ? (provisionedTask.taskView.diffView.activeFile?.path ?? undefined)
      : undefined;
}

function useActiveFileProjectId(): string {
  const provisionedTask = useProvisionedTask();
  const { view } = provisionedTask.taskView;
  const { projectId } = useTaskViewContext();
  return view === 'editor'
    ? (provisionedTask.taskView.editorView.activeTab?.projectId ?? projectId)
    : view === 'diff'
      ? (provisionedTask.taskView.diffView.activeFile?.projectId ?? projectId)
      : projectId;
}

function useActiveLineNumber(activeFilePath: string | undefined): number | undefined {
  const provisionedTask = useProvisionedTask();
  const { view } = provisionedTask.taskView;
  const editorPosition = view === 'editor' ? getActiveEditorPosition() : null;
  return editorPosition?.lineNumber ?? (activeFilePath ? 1 : undefined);
}

function useWorktreePath(activeFileProjectId: string): string {
  const provisionedTask = useProvisionedTask();
  return provisionedTask.isMultiProject && activeFileProjectId
    ? (provisionedTask.projectContexts?.projects.get(activeFileProjectId)?.worktreePath ??
        provisionedTask.path)
    : provisionedTask.path;
}

function useProjectOptions(): OpenInProjectOption[] | undefined {
  const provisionedTask = useProvisionedTask();
  // Computed directly so MobX can track changes to projectContexts.projects
  if (!provisionedTask.isMultiProject || !provisionedTask.projectContexts) return undefined;
  return Array.from(provisionedTask.projectContexts.projects.values())
    .filter((ctx) => ctx.worktreePath)
    .map((ctx) => ({
      projectId: ctx.projectId,
      projectName: ctx.projectName,
      worktreePath: ctx.worktreePath!,
    }));
}

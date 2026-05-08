import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Home, ListPlus, Server } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import {
  ClonePanel,
  CreateNewPanel,
  PickExistingPanel,
} from '@renderer/features/projects/components/add-project-modal/content';
import {
  useCloneMode,
  useNewMode,
  usePickMode,
} from '@renderer/features/projects/components/add-project-modal/modes';
import { SshConnectionSelector } from '@renderer/features/projects/components/add-project-modal/ssh-connection-selector';
import {
  asMounted,
  getProjectManagerStore,
} from '@renderer/features/projects/stores/project-selectors';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal, type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { useGithubContext } from '@renderer/lib/providers/github-context-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldLabel } from '@renderer/lib/ui/field';
import { ModalLayout } from '@renderer/lib/ui/modal-layout';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { log } from '@renderer/utils/logger';
import { workspaceManagerStore } from '../stores/workspace-manager';

export interface CreateWorkspaceModalProps extends BaseModalProps<void> {}

type Strategy = 'local' | 'ssh';
type Mode = 'pick' | 'new' | 'clone';

export const CreateWorkspaceModal = observer(function CreateWorkspaceModal({
  onSuccess,
  onClose,
}: CreateWorkspaceModalProps) {
  const { navigate } = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected existing projects
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  // New project creation state (same as add-project-modal)
  const [strategy, setStrategy] = useState<Strategy>('local');
  const [mode, setMode] = useState<Mode>('pick');
  const [connectionId, setConnectionId] = useState<string | undefined>(undefined);

  // Load existing projects
  useEffect(() => {
    getProjectManagerStore().load();
  }, []);

  const projects = Array.from(getProjectManagerStore().projects.values())
    .map((p) => asMounted(p))
    .filter((p) => p !== undefined);

  // SSH connections
  const { connections } = appState.sshConnections;
  const availableConnectionIds = useMemo(
    () =>
      connections.map((connection) => connection.id).filter((id): id is string => id !== undefined),
    []
  );
  const selectedConnectionId =
    strategy === 'ssh' ? (connectionId ?? availableConnectionIds[0]) : connectionId;

  const { isInitialized, needsGhAuth } = useGithubContext();
  const showGithubAuthDisclaimer = mode === 'new' && isInitialized && needsGhAuth;

  const showSshConnModal = useShowModal('addSshConnModal');
  const showCreateWorkspaceModal = useShowModal('createWorkspaceModal');

  const handleAddConnection = () => {
    showSshConnModal({
      onSuccess: (result: unknown) => {
        const data = result as { connectionId: string };
        setConnectionId(data.connectionId);
      },
      onClose: () => showCreateWorkspaceModal({}),
    });
  };

  const handleEditConnection = (id: string) => {
    const conn = appState.sshConnections.connections.find((c) => c.id === id);
    if (!conn) return;
    showSshConnModal({
      initialConfig: conn,
      onSuccess: () => showCreateWorkspaceModal({}),
      onClose: () => showCreateWorkspaceModal({}),
    });
  };

  // Project creation modes
  const { value: localProjectSettings } = useAppSettingsKey('localProject');
  const defaultPath = localProjectSettings?.defaultProjectsDirectory ?? '';

  const pickState = usePickMode();
  const newState = useNewMode(defaultPath);
  const cloneState = useCloneMode(defaultPath);
  const activeMode = { pick: pickState, new: newState, clone: cloneState }[mode];

  // Path status check for pick mode
  const shouldCheckPickPathStatus =
    mode === 'pick' &&
    pickState.path.trim().length > 0 &&
    (strategy === 'local' || !!selectedConnectionId);
  const pickPathStatusQuery = useQuery({
    queryKey: ['projectPathStatus', strategy, selectedConnectionId, pickState.path],
    queryFn: () =>
      strategy === 'ssh'
        ? rpc.projects.getSshProjectPathStatus(pickState.path, selectedConnectionId!)
        : rpc.projects.getLocalProjectPathStatus(pickState.path),
    enabled: shouldCheckPickPathStatus,
  });
  const requiresGitInitialization =
    mode === 'pick' &&
    pickPathStatusQuery.data?.isDirectory === true &&
    pickPathStatusQuery.data.isGitRepo === false;
  const isCheckingPickPathStatus = shouldCheckPickPathStatus && pickPathStatusQuery.isPending;

  const canCreateNewProject =
    activeMode.isValid &&
    (strategy === 'local' || !!selectedConnectionId) &&
    !isCheckingPickPathStatus &&
    (!requiresGitInitialization || pickState.initGitRepository);

  const canCreateWorkspace =
    workspaceName.trim().length > 0 && (selectedProjectIds.size > 0 || canCreateNewProject);

  const toggleProject = (projectId: string) => {
    const newSet = new Set(selectedProjectIds);
    if (newSet.has(projectId)) {
      newSet.delete(projectId);
    } else {
      newSet.add(projectId);
    }
    setSelectedProjectIds(newSet);
  };

  const handleSubmit = async () => {
    if (!workspaceName.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const projectIds = Array.from(selectedProjectIds);

      // Create new project if specified
      if (canCreateNewProject) {
        let projectId: string | undefined;

        // Check if project already exists
        try {
          if (strategy === 'local') {
            const project = await rpc.projects.getLocalProjectByPath(pickState.path);
            if (project) projectId = project.id;
          }
          if (strategy === 'ssh' && !projectId) {
            const project = await rpc.projects.getSshProjectByPath(
              pickState.path,
              selectedConnectionId!
            );
            if (project) projectId = project.id;
          }
        } catch (e) {
          log.error(e);
        }

        if (projectId) {
          // Project exists, add it
          projectIds.push(projectId);
        } else {
          // Create new project
          const id = crypto.randomUUID();
          const projectType =
            strategy === 'ssh' && selectedConnectionId
              ? { type: 'ssh' as const, connectionId: selectedConnectionId }
              : { type: 'local' as const };

          switch (mode) {
            case 'pick':
              await getProjectManagerStore().createProject(
                projectType,
                {
                  mode: 'pick',
                  name: pickState.name,
                  path: pickState.path,
                  initGitRepository: pickState.initGitRepository,
                },
                id
              );
              break;
            case 'new':
              await getProjectManagerStore().createProject(
                projectType,
                {
                  mode: 'new',
                  name: newState.name,
                  path: newState.path,
                  repositoryName: newState.repositoryName,
                  repositoryOwner: newState.repositoryOwner?.value ?? '',
                  repositoryVisibility: newState.repositoryVisibility,
                },
                id
              );
              break;
            case 'clone':
              await getProjectManagerStore().createProject(
                projectType,
                {
                  mode: 'clone',
                  name: cloneState.name,
                  path: cloneState.path,
                  repositoryUrl: cloneState.repositoryUrl,
                },
                id
              );
              break;
          }
          projectIds.push(id);
        }
      }

      const workspaceId = await workspaceManagerStore.createWorkspace({
        id: crypto.randomUUID(),
        name: workspaceName.trim(),
        projectIds,
      });

      onSuccess(void 0);
      navigate('workspace', { workspaceId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT')) {
        setError('A workspace with this name already exists');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalLayout
      header={
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>
      }
      footer={
        <DialogFooter>
          <ConfirmButton
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canCreateWorkspace || loading}
          >
            {loading ? 'Creating...' : 'Create'}
          </ConfirmButton>
        </DialogFooter>
      }
    >
      <DialogContentArea className="gap-4">
        {/* Workspace name */}
        <Field>
          <FieldLabel>Workspace Name</FieldLabel>
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setError(null);
            }}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="My Workspace"
            autoFocus
          />
        </Field>

        {/* Select existing projects */}
        <Field>
          <FieldLabel className="flex items-center gap-2">
            <ListPlus className="h-4 w-4" />
            Select Existing Projects ({selectedProjectIds.size})
          </FieldLabel>
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border bg-background">
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground-tertiary-muted">
                No existing projects
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.data.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-background-tertiary-1 cursor-pointer border-b border-border last:border-b-0"
                  onClick={() => toggleProject(project.data.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.has(project.data.id)}
                    onChange={() => toggleProject(project.data.id)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="truncate text-sm flex-1">{project.data.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project.data.type === 'ssh' ? 'SSH' : 'Local'}
                  </span>
                </div>
              ))
            )}
          </div>
        </Field>

        {/* Separator */}
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-foreground-tertiary-muted">or create new</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* New project creation - same UI as add-project-modal */}
        <div className="border border-border rounded p-3 space-y-3">
          {/* Mode + Strategy toggles */}
          <div className="flex items-center gap-2">
            <ToggleGroup
              className="w-full flex-1"
              value={[mode]}
              onValueChange={([value]) => {
                if (value) setMode(value as Mode);
              }}
            >
              <ToggleGroupItem value="pick" className="flex-1">
                Pick
              </ToggleGroupItem>
              <ToggleGroupItem value="new" className="flex-1">
                New
              </ToggleGroupItem>
              <ToggleGroupItem value="clone" className="flex-1">
                Clone
              </ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              value={[strategy]}
              onValueChange={([value]) => {
                if (value) setStrategy(value as Strategy);
              }}
              size="sm"
            >
              <Tooltip>
                <TooltipTrigger>
                  <ToggleGroupItem value="local" aria-label="Local" className="rounded-l-md">
                    <Home className="size-3.5" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Local</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <ToggleGroupItem value="ssh" aria-label="SSH" className="rounded-r-md">
                    <Server className="size-3.5" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>SSH</TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>

          {/* SSH connection selector */}
          {strategy === 'ssh' && !showGithubAuthDisclaimer && (
            <Field>
              <FieldLabel>SSH Connection</FieldLabel>
              <SshConnectionSelector
                connectionId={selectedConnectionId}
                onConnectionIdChange={setConnectionId}
                onAddConnection={handleAddConnection}
                onEditConnection={handleEditConnection}
              />
            </Field>
          )}

          {/* Mode-specific panels */}
          {mode === 'pick' && (
            <PickExistingPanel
              strategy={strategy}
              connectionId={selectedConnectionId}
              state={pickState}
              showInitializeGitPrompt={requiresGitInitialization}
            />
          )}
          {mode === 'new' && (
            <CreateNewPanel
              strategy={strategy}
              connectionId={selectedConnectionId}
              state={newState}
              showGithubAuthDisclaimer={showGithubAuthDisclaimer}
              onOpenAccountSettings={() => navigate('settings', { tab: 'account' })}
            />
          )}
          {mode === 'clone' && (
            <ClonePanel
              strategy={strategy}
              connectionId={selectedConnectionId}
              state={cloneState}
            />
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </DialogContentArea>
    </ModalLayout>
  );
});

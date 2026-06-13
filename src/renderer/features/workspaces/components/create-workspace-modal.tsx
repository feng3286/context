import { ListPlus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  asMounted,
  getProjectManagerStore,
} from '@renderer/features/projects/stores/project-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldLabel } from '@renderer/lib/ui/field';
import { ModalLayout } from '@renderer/lib/ui/modal-layout';
import { workspaceManagerStore } from '../stores/workspace-manager';

export interface CreateWorkspaceModalProps extends BaseModalProps<void> {}

export const CreateWorkspaceModal = observer(function CreateWorkspaceModal({
  onSuccess,
  onClose,
}: CreateWorkspaceModalProps) {
  const { t } = useTranslation();
  const { navigate } = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getProjectManagerStore().load();
  }, []);

  const projects = Array.from(getProjectManagerStore().projects.values())
    .map((p) => asMounted(p))
    .filter((p) => p !== undefined);

  const canCreateWorkspace = workspaceName.trim().length > 0 && selectedProjectIds.size > 0;

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
      setError(t('workspaces:nameRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const projectIds = Array.from(selectedProjectIds);

      const workspaceId = await workspaceManagerStore.createWorkspace({
        id: crypto.randomUUID(),
        name: workspaceName.trim(),
        projectIds,
      });

      onSuccess(void 0);
      navigate('workspace', { workspaceId });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('workspaces:failedToCreateWorkspace');
      if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT')) {
        setError(t('workspaces:workspaceNameExists'));
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
          <DialogTitle>{t('workspaces:createWorkspace')}</DialogTitle>
        </DialogHeader>
      }
      footer={
        <DialogFooter>
          <ConfirmButton
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canCreateWorkspace || loading}
          >
            {loading ? t('workspaces:creating') : t('workspaces:create')}
          </ConfirmButton>
        </DialogFooter>
      }
    >
      <DialogContentArea className="gap-4">
        <Field>
          <FieldLabel>{t('workspaces:workspaceName')}</FieldLabel>
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setError(null);
            }}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('workspaces:workspaceNamePlaceholder')}
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel className="flex items-center gap-2">
            <ListPlus className="h-4 w-4" />
            {t('workspaces:selectProjects', { count: selectedProjectIds.size })}
          </FieldLabel>
          <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border bg-background">
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground-tertiary-muted">
                {t('workspaces:noExistingProjects')}
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

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </DialogContentArea>
    </ModalLayout>
  );
});

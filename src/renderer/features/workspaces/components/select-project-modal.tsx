import { Check } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  asMounted,
  getProjectManagerStore,
} from '@renderer/features/projects/stores/project-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
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
import { WorkspaceStoreClass } from '../stores/workspace-store';

export interface SelectProjectModalProps extends BaseModalProps<void> {
  workspaceId: string;
}

export const SelectProjectModal = observer(function SelectProjectModal({
  workspaceId,
  onSuccess,
  onClose,
}: SelectProjectModalProps) {
  const { t } = useTranslation();
  const { navigate } = useNavigate();
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const workspaceStore = workspaceManagerStore.getWorkspace(workspaceId);
  const existingProjectIds =
    workspaceStore?.status === 'ready'
      ? new Set(workspaceStore.projects.map((p) => p.id))
      : new Set();

  useEffect(() => {
    getProjectManagerStore().load();
  }, []);

  const projects = Array.from(getProjectManagerStore().projects.values())
    .map((p) => asMounted(p))
    .filter(
      (p): p is NonNullable<typeof p> => p !== undefined && !existingProjectIds.has(p.data.id)
    );

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
    if (selectedProjectIds.size === 0) return;

    setLoading(true);
    try {
      const store = workspaceManagerStore.getWorkspace(workspaceId);
      if (store) {
        for (const projectId of selectedProjectIds) {
          await (store as WorkspaceStoreClass).addProject(projectId);
        }
      }
      onSuccess(void 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalLayout
      header={
        <DialogHeader>
          <DialogTitle>{t('workspaces:addProjectsToWorkspace')}</DialogTitle>
        </DialogHeader>
      }
      footer={
        <DialogFooter>
          <ConfirmButton
            type="button"
            onClick={() => void handleSubmit()}
            disabled={selectedProjectIds.size === 0 || loading}
          >
            {loading
              ? t('workspaces:adding')
              : t('workspaces:addProjectsCount', { count: selectedProjectIds.size })}
          </ConfirmButton>
        </DialogFooter>
      }
    >
      <DialogContentArea className="gap-4">
        <Field>
          <FieldLabel>{t('workspaces:selectProjects')}</FieldLabel>
          <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border bg-background">
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground-tertiary-muted">
                {t('workspaces:noAvailableProjects')}
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.data.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-background-tertiary-1 cursor-pointer border-b border-border last:border-b-0"
                  onClick={() => toggleProject(project.data.id)}
                >
                  <div
                    className={`h-4 w-4 rounded border border-border flex items-center justify-center ${selectedProjectIds.has(project.data.id) ? 'bg-primary border-primary' : ''}`}
                  >
                    {selectedProjectIds.has(project.data.id) && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="truncate text-sm flex-1">{project.data.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project.data.type === 'ssh' ? 'SSH' : 'Local'}
                  </span>
                </div>
              ))
            )}
          </div>
        </Field>
      </DialogContentArea>
    </ModalLayout>
  );
});

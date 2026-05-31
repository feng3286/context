import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { SettingsPanel } from '@renderer/features/projects/components/settings-view/settings-panel';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { DialogContentArea, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';

type Props = BaseModalProps<void> & { projectId: string };

export const ProjectSettingsModal = observer(function ProjectSettingsModal({ projectId }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col max-h-[70vh] overflow-hidden">
      <DialogHeader showCloseButton>
        <DialogTitle>{t('projectSettings:title')}</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="overflow-y-auto pt-0">
        <SettingsPanel projectId={projectId} />
      </DialogContentArea>
    </div>
  );
});

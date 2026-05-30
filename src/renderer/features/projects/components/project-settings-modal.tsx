import { observer } from 'mobx-react-lite';
import { SettingsPanel } from '@renderer/features/projects/components/settings-view/settings-panel';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { DialogContentArea, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';

type Props = BaseModalProps<void> & { projectId: string };

export const ProjectSettingsModal = observer(function ProjectSettingsModal({ projectId }: Props) {
  return (
    <div className="flex flex-col max-h-[70vh] overflow-hidden">
      <DialogHeader showCloseButton>
        <DialogTitle>Project Settings</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="overflow-y-auto pt-0">
        <SettingsPanel projectId={projectId} />
      </DialogContentArea>
    </div>
  );
});

import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { PullRequestView } from '@renderer/features/projects/components/pr-view/pr-view';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { DialogContentArea, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';

type Props = BaseModalProps<void> & { projectId: string };

export const PullRequestsModal = observer(function PullRequestsModal({ projectId }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-[70vh] min-h-0 overflow-hidden">
      <DialogHeader showCloseButton>
        <DialogTitle>{t('git:pullRequests.title')}</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex-1 min-h-0 overflow-hidden px-3 pt-0 pb-3">
        <PullRequestView projectId={projectId} compact />
      </DialogContentArea>
    </div>
  );
});

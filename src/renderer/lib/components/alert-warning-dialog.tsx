import { TriangleAlert } from 'lucide-react';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';

export type AlertWarningDialogArgs = {
  title: string;
  message: string;
  details?: string;
};

type Props = BaseModalProps<void> & AlertWarningDialogArgs;

export function AlertWarningDialog({ title, message, details, onClose }: Props) {
  return (
    <>
      <DialogHeader showCloseButton={false}>
        <DialogTitle className="flex items-center gap-2">
          <TriangleAlert className="size-5 text-amber-500" />
          {title}
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="pt-0">
        <p className="text-sm">{message}</p>
        {details && <p className="text-xs text-foreground-muted mt-2">{details}</p>}
      </DialogContentArea>
      <DialogFooter>
        <Button onClick={onClose}>OK</Button>
      </DialogFooter>
    </>
  );
}

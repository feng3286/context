import { Download, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rpc } from '@renderer/lib/ipc';
import { appState } from '@renderer/lib/stores/app-state';
import { Button } from '@renderer/lib/ui/button';
import {
  Dialog,
  DialogContent,
  DialogContentArea,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { cn } from '@renderer/utils/utils';

export const UpdateAvailableDialog: React.FC = () => {
  const { t } = useTranslation();
  const update = appState.update;
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const version = update.updateDialogVersion;
  const open = update.showUpdateDialog && !!version;

  useEffect(() => {
    if (!open || !version) return;
    setLoadingNotes(true);
    rpc.update
      .getReleaseNotes()
      .then((res) => {
        if (res && res.success) {
          setReleaseNotes(res.data ?? null);
        } else {
          setReleaseNotes(null);
        }
      })
      .catch(() => {
        setReleaseNotes(null);
      })
      .finally(() => {
        setLoadingNotes(false);
      });
  }, [open, version]);

  const handleDownload = () => {
    void update.download();
    update.dismissUpdateDialog();
  };

  const handleRemindLater = () => {
    update.dismissUpdateDialog();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleRemindLater()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="border-b border-border/60">
          <DialogHeader className="px-6 py-4" showCloseButton={false}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
                <Sparkles className="h-5 w-5 text-accent-foreground" />
              </div>
              <DialogTitle className="text-lg font-semibold">{t('updateDialog.title')}</DialogTitle>
            </div>
          </DialogHeader>
        </div>

        <DialogContentArea className="space-y-4 px-6 py-5">
          <p className="text-sm text-foreground-muted">{t('updateDialog.description')}</p>

          {/* Version badges */}
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                {t('updateDialog.currentVersion')}
              </div>
              <div className="mt-0.5 font-mono text-sm font-medium">
                {update.currentVersion || '...'}
              </div>
            </div>
            <div className="text-foreground-muted">→</div>
            <div className="flex-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                {t('updateDialog.newVersion')}
              </div>
              <div className="mt-0.5 font-mono text-sm font-medium text-accent-foreground">
                {version}
              </div>
            </div>
          </div>

          {/* Release notes */}
          {releaseNotes && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground-muted">
                {t('updateDialog.releaseNotes')}
              </div>
              <div
                className={cn(
                  'max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground-muted'
                )}
                dangerouslySetInnerHTML={{ __html: releaseNotes }}
              />
            </div>
          )}

          {loadingNotes && (
            <div className="text-xs text-foreground-muted">Loading release notes...</div>
          )}
        </DialogContentArea>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button type="button" variant="outline" size="sm" onClick={handleRemindLater}>
            {t('updateDialog.remindLater')}
          </Button>
          <Button type="button" size="sm" onClick={handleDownload}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t('updateDialog.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

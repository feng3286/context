import { AlertTriangle, X } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { BranchMismatchInfo } from '@shared/tasks';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@renderer/lib/ui/alert';
import { Button } from '@renderer/lib/ui/button';

export const BranchMismatchBanner = observer(function BranchMismatchBanner({
  mismatches,
  onDismiss,
}: {
  mismatches: BranchMismatchInfo[];
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  if (mismatches.length === 0) return null;

  const names = mismatches.map((m) => m.projectName);
  const description =
    mismatches.length === 1
      ? t('branchMismatch:description', { projectName: names[0] })
      : t('branchMismatch:descriptionPlural', {
          projectNames: names.join(', '),
        });

  return (
    <div className="w-full">
      <Alert
        variant="default"
        className="border-l-4 border-l-amber-500/50 border-t-amber-500/30 border-r-amber-500/30 border-b-amber-500/30 bg-amber-500/5 rounded-lg mx-2 mb-2"
      >
        <AlertTriangle className="size-4 text-amber-500" />
        <AlertTitle className="text-amber-600 dark:text-amber-400">
          {t('branchMismatch:title')}
        </AlertTitle>
        <AlertDescription className="text-foreground-muted">
          <p className="mb-2">{description}</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {mismatches.map((m) => (
              <li key={m.projectId} className="text-xs font-mono">
                <span className="text-foreground-passive">{t('branchMismatch:expected')}:</span>{' '}
                <span className="text-foreground">{m.expectedBranch}</span>{' '}
                <span className="text-foreground-passive">→ {t('branchMismatch:actual')}:</span>{' '}
                <span className="text-foreground-destructive">
                  {m.actualBranch ?? t('branchMismatch:detachedHead')}
                </span>
              </li>
            ))}
          </ul>
        </AlertDescription>
        <AlertAction>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-foreground-passive hover:text-foreground"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
});

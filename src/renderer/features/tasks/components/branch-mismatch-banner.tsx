import { AlertTriangle, X } from 'lucide-react';
import { observer } from 'mobx-react-lite';
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
  if (mismatches.length === 0) return null;

  return (
    <Alert variant="default" className="mx-4 mt-3 border-amber-500/50 bg-amber-500/5">
      <AlertTriangle className="size-4 text-amber-500" />
      <AlertTitle className="text-amber-600 dark:text-amber-400">
        Working branch mismatch detected
      </AlertTitle>
      <AlertDescription className="text-foreground-muted">
        <p className="mb-2">
          {mismatches.length === 1 ? `The worktree for ` : `The worktrees for `}
          {mismatches.map((m, i) => (
            <span key={m.projectId}>
              {i > 0 && (mismatches.length > 2 ? ', ' : ' ')}
              {mismatches.length > 1 && i === mismatches.length - 1 && 'and '}
              <span className="font-medium text-foreground">{m.projectName}</span>
            </span>
          ))}
          {mismatches.length === 1 ? ' is ' : ' are '}
          on an unexpected branch:
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          {mismatches.map((m) => (
            <li key={m.projectId} className="text-xs font-mono">
              <span className="text-foreground-passive">expected:</span>{' '}
              <span className="text-foreground">{m.expectedBranch}</span>{' '}
              <span className="text-foreground-passive">→ actual:</span>{' '}
              <span className="text-foreground-destructive">
                {m.actualBranch ?? '(detached HEAD)'}
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
  );
});

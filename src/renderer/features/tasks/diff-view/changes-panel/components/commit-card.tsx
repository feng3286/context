import { CheckCircle, Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitStore } from '@renderer/features/tasks/diff-view/stores/git-store';
import type { ProjectChangesViewStore } from '@renderer/features/tasks/stores/project-changes-view-store';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { Input } from '@renderer/lib/ui/input';
import { SplitButton, type SplitButtonAction } from '@renderer/lib/ui/split-button';
import { Textarea } from '@renderer/lib/ui/textarea';

type CommitPhase = 'idle' | 'committing' | 'commit-only-done' | 'committed' | 'pushing' | 'pushed';

interface CommitCardProps {
  autoStage?: boolean;
  /** Use this GitStore instead of the workspace-level one (multi-project mode). */
  gitOverride?: GitStore;
  /** Use this changes view store instead of the workspace-level one (multi-project mode). */
  changesViewOverride?: ProjectChangesViewStore;
}

export const CommitCard = observer(function CommitCard({
  autoStage = false,
  gitOverride,
  changesViewOverride,
}: CommitCardProps) {
  const { t } = useTranslation();
  const provisioned = useProvisionedTask();
  const isMultiProject = !!gitOverride;
  const effectiveGit = gitOverride ?? provisioned.workspace.git;
  const diffView = provisioned.taskView.diffView;
  const effectiveChangesView = changesViewOverride ?? diffView.changesView;
  const hasPRs = effectiveChangesView.expandedPullRequests;
  const [commitMessage, setCommitMessage] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<CommitPhase>('idle');
  const [localCommitAction, setLocalCommitAction] = useState<'commit' | 'commit-push' | null>(null);
  const fullMessage = description ? `${commitMessage}\n\n${description}` : commitMessage;
  const isInFlight = phase !== 'idle';

  // Commit action preference: workspace-level in single-project, local state in multi-project
  const effectiveCommitAction = isMultiProject
    ? (localCommitAction ?? (effectiveGit.isBranchPublished ? 'commit-push' : 'commit'))
    : diffView.effectiveCommitAction;

  const handleCommitActionChange = (value: string) => {
    if (isMultiProject) {
      setLocalCommitAction(value as 'commit' | 'commit-push');
    } else {
      diffView.setCommitAction(value as 'commit' | 'commit-push');
    }
  };

  const doCommit = async () => {
    setPhase('committing');
    if (autoStage) {
      effectiveChangesView.suppressNextAutoExpand('staged');
      await effectiveGit.stageAllFiles();
    }
    const result = await effectiveGit.commit(fullMessage);
    if (!result.success) {
      setPhase('idle');
      return;
    }
    setCommitMessage('');
    setDescription('');
    if (!autoStage) {
      effectiveChangesView.setExpanded({ unstaged: true, staged: false, pullRequests: hasPRs });
    }
    setPhase('commit-only-done');
    setTimeout(() => setPhase('idle'), 3000);
  };

  const doCommitAndPush = async () => {
    setPhase('committing');
    if (autoStage) {
      effectiveChangesView.suppressNextAutoExpand('staged');
      await effectiveGit.stageAllFiles();
    }
    const commitResult = await effectiveGit.commit(fullMessage);
    if (!commitResult.success) {
      setPhase('idle');
      return;
    }
    setCommitMessage('');
    setDescription('');
    if (!autoStage) {
      effectiveChangesView.setExpanded({ unstaged: true, staged: false, pullRequests: hasPRs });
    }
    setPhase('committed');
    await new Promise((r) => setTimeout(r, 1000));
    setPhase('pushing');
    const pushResult = await effectiveGit.push();
    if (!pushResult.success) {
      setPhase('idle');
      return;
    }
    setPhase('pushed');
    setTimeout(() => setPhase('idle'), 3000);
  };

  const actions: SplitButtonAction[] = [
    { value: 'commit', label: t('git:commit.commit'), action: doCommit },
    { value: 'commit-push', label: t('git:commit.commitAndPush'), action: doCommitAndPush },
  ];

  return (
    <div className="shrink-0 mx-2 mb-2 flex flex-col gap-2 items-center justify-between rounded-xl border border-border bg-background-1 p-2">
      <Input
        placeholder={t('git:commit.message')}
        autoFocus
        className="w-full bg-background"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        disabled={isInFlight}
      />
      <Textarea
        placeholder={t('git:commit.description')}
        className="w-full bg-background"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isInFlight}
      />
      {phase === 'idle' && (
        <SplitButton
          actions={actions}
          size="sm"
          className="w-full"
          disabled={!commitMessage.trim()}
          defaultValue={effectiveCommitAction}
          onValueChange={handleCommitActionChange}
        />
      )}
      {phase === 'committing' && (
        <StatusRow
          icon={<Loader2 className="size-4 animate-spin" />}
          label={t('git:commit.committing')}
        />
      )}
      {(phase === 'commit-only-done' || phase === 'committed') && (
        <StatusRow
          icon={<CheckCircle className="size-4 text-green-500" />}
          label={t('git:commit.committed')}
        />
      )}
      {phase === 'pushing' && (
        <StatusRow
          icon={<Loader2 className="size-4 animate-spin" />}
          label={t('git:commit.pushing')}
        />
      )}
      {phase === 'pushed' && (
        <StatusRow
          icon={<CheckCircle className="size-4 text-green-500" />}
          label={t('git:commit.pushed')}
        />
      )}
    </div>
  );
});

function StatusRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-2 py-1 text-sm text-foreground-muted">
      {icon}
      <span>{label}</span>
    </div>
  );
}

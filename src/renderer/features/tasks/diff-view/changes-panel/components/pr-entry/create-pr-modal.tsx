import { ChevronDown, CircleAlert, GitBranch } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Branch } from '@shared/git';
import { getRepositoryStore } from '@renderer/features/projects/stores/project-selectors';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { BranchDisplay } from '@renderer/lib/components/branch-display';
import { ProjectBranchSelector } from '@renderer/lib/components/project-branch-selector';
import { rpc } from '@renderer/lib/ipc';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Alert, AlertDescription, AlertTitle } from '@renderer/lib/ui/alert';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@renderer/lib/ui/field';
import { Input } from '@renderer/lib/ui/input';
import { Separator } from '@renderer/lib/ui/separator';
import { SplitButton } from '@renderer/lib/ui/split-button';
import { Textarea } from '@renderer/lib/ui/textarea';
import { log } from '@renderer/utils/logger';
import { resolveInitialBaseBranch } from './base-branch';

export type CreatePrModalArgs = {
  nameWithOwner: string; // kept as-is for modal registry compatibility; value is a repositoryUrl
  branchName: string;
  draft: boolean;
  workspaceId: string;
};

type Props = BaseModalProps<void> & CreatePrModalArgs;

export const CreatePrModal = observer(function CreatePrModal({
  nameWithOwner: repositoryUrl,
  branchName,
  draft,
  workspaceId,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const { projectId, taskId } = useTaskViewContext();
  const provisionedTask = useProvisionedTask();
  const [title, setTitle] = useState(branchName);
  const [description, setDescription] = useState('');
  const [selectedBaseOverride, setSelectedBaseOverride] = useState<Branch | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repo = getRepositoryStore(projectId);
  const defaultBranch = repo?.defaultBranch;
  // Get sourceBranch from projectContext using the current projectId
  const projectContext = provisionedTask?.projectContexts?.projects.get(projectId);
  const sourceBranchName = projectContext?.sourceBranch ?? undefined;
  const isOnRemote = repo?.isBranchOnRemote(branchName) ?? false;
  const aheadCount = repo?.getBranchDivergence(branchName)?.ahead ?? 0;
  const needsPush = !isOnRemote || aheadCount > 0;

  const hasGitHubRemote = Boolean(repositoryUrl);
  const selectedBase =
    selectedBaseOverride ??
    resolveInitialBaseBranch(repo?.remoteBranches ?? [], sourceBranchName, defaultBranch);

  const doCreate = async (push: boolean) => {
    if (!title.trim() || !repositoryUrl || !selectedBase?.branch) return;
    setError(null);
    setIsCreating(true);
    try {
      if (push) {
        const pushResult = await rpc.git.push(
          projectId,
          workspaceId,
          repo?.configuredRemote.name ?? 'origin'
        );
        if (!pushResult.success) {
          log.error('Failed to push branch:', pushResult.error);
          setError(
            ('message' in pushResult.error && pushResult.error.message) ||
              t('createPr:failedToPush')
          );
          return;
        }
      }

      const result = await rpc.pullRequests.createPullRequest({
        repositoryUrl,
        head: branchName,
        base: selectedBase.branch,
        title: title.trim(),
        body: description.trim() || undefined,
        draft,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden max-h-[70vh]">
      <DialogHeader>
        <DialogTitle>{draft ? t('createPr:draftTitle') : t('createPr:prTitle')}</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="space-y-4">
        {!hasGitHubRemote && (
          <p className="text-sm text-muted-foreground">{t('createPr:noRemoteWarning')}</p>
        )}
        <div className="flex items-center gap-2 flex-col">
          <BranchDisplay
            label={t('createPr:headBranch')}
            branchName={branchName}
            className="border border-border rounded-md"
          />
          <ProjectBranchSelector
            projectId={projectId}
            value={selectedBase}
            onValueChange={setSelectedBaseOverride}
            remoteOnly
            trigger={
              <ComboboxTrigger className="flex w-full items-center gap-2 justify-between border border-border rounded-md p-2 text-left outline-none">
                <div className="flex flex-col text-left text-sm gap-0.5">
                  <span className="text-foreground-passive text-xs">
                    {t('createPr:baseBranch')}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitBranch
                      absoluteStrokeWidth
                      strokeWidth={2}
                      className="size-3.5 shrink-0 text-foreground-muted"
                    />
                    <ComboboxValue placeholder={t('createPr:selectBaseBranch')} />
                  </span>
                </div>
                <ChevronDown className="size-4 shrink-0 text-foreground-muted" />
              </ComboboxTrigger>
            }
          />
        </div>
        <Separator />
        <FieldGroup>
          <Field>
            <FieldLabel>{t('createPr:titleField')}</FieldLabel>
            <Input
              placeholder={t('createPr:titlePlaceholder')}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!hasGitHubRemote}
            />
          </Field>
          <Field>
            <FieldLabel>{t('createPr:description')}</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={1}
              disabled={!hasGitHubRemote}
            />
          </Field>
        </FieldGroup>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t('createPr:failedToCreate')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContentArea>
      <DialogFooter>
        {needsPush ? (
          <SplitButton
            size="sm"
            loading={isCreating}
            loadingLabel={t('createPr:creating')}
            disabled={!hasGitHubRemote || !selectedBase?.branch || !title.trim()}
            actions={[
              {
                value: 'push-and-create',
                label: draft ? t('createPr:pushAndCreateDraft') : t('createPr:pushAndCreatePR'),
                action: () => void doCreate(true),
              },
              {
                value: 'create-only',
                label: draft ? t('createPr:createDraft') : t('createPr:createPR'),
                description: t('createPr:skipPushDesc'),
                action: () => void doCreate(false),
              },
            ]}
          />
        ) : (
          <ConfirmButton
            size="sm"
            onClick={() => void doCreate(false)}
            disabled={!hasGitHubRemote || !selectedBase?.branch || !title.trim() || isCreating}
          >
            {isCreating
              ? t('createPr:creating')
              : draft
                ? t('createPr:createDraft')
                : t('createPr:createPR')}
          </ConfirmButton>
        )}
      </DialogFooter>
    </div>
  );
});

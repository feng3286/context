import { Folder } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Input } from '@renderer/lib/ui/input';
import { Switch } from '@renderer/lib/ui/switch';
import { cn } from '@renderer/utils/utils';
import { ResetToDefaultButton } from './ResetToDefaultButton';
import { SettingRow } from './SettingRow';

const RepositorySettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const {
    value: localProject,
    update,
    isLoading: loading,
    isSaving: saving,
    isFieldOverridden,
    resetField,
  } = useAppSettingsKey('localProject');

  const branchPrefix = localProject?.branchPrefix ?? '';
  const defaultWorktreeDirectory = localProject?.defaultWorktreeDirectory ?? '';
  const writeAgentConfigToGitIgnore = localProject?.writeAgentConfigToGitIgnore ?? true;

  const example = useMemo(() => {
    const suffix = 'abcde'; // Example suffix (5 random letters)
    return branchPrefix ? `${branchPrefix}/my-feature-${suffix}` : `my-feature-${suffix}`;
  }, [branchPrefix]);

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="break-words text-sm text-foreground">
              {t('settings:repository.worktreeDir')}
            </span>
            <span className="break-words text-xs text-foreground-passive">
              {t('settings:repository.worktreeDirDesc')}
            </span>
          </div>
          <ResetToDefaultButton
            visible={isFieldOverridden('defaultWorktreeDirectory')}
            defaultLabel="~/context/worktrees"
            onReset={() => resetField('defaultWorktreeDirectory')}
            disabled={loading || saving}
          />
        </div>
        <button
          className="h-9 border border-border rounded-md p-2 w-full flex items-center gap-2 hover:bg-background-quaternary-1 pr-1.5 transition-colors"
          onClick={async () => {
            const result = await rpc.app.openSelectDirectoryDialog({
              title: t('settings:repository.selectWorktreeTitle'),
              message: t('settings:repository.selectWorktreeMessage'),
            });
            if (result) {
              update({ defaultWorktreeDirectory: result });
            }
          }}
        >
          <Folder className="size-4 text-foreground-muted shrink-0" />
          <p
            className={cn(
              'text-sm text-foreground-passive truncate min-w-0 flex-1 text-left',
              defaultWorktreeDirectory ? 'text-foreground' : ''
            )}
          >
            {defaultWorktreeDirectory || '~/context/worktrees'}
          </p>
          <Button variant="outline" size="xs" tabIndex={-1}>
            {t('settings:repository.choose')}
          </Button>
        </button>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Input
            key={branchPrefix}
            defaultValue={branchPrefix}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== branchPrefix) {
                update({ branchPrefix: next });
              }
            }}
            placeholder={t('settings:repository.branchPrefix')}
            aria-label={t('settings:repository.branchPrefix')}
            disabled={loading}
            className="flex-1"
          />
          <ResetToDefaultButton
            visible={isFieldOverridden('branchPrefix')}
            defaultLabel="context"
            onReset={() => resetField('branchPrefix')}
            disabled={loading || saving}
          />
        </div>
        <div className="text-[11px] text-muted-foreground">
          Example: <code className="rounded bg-muted/60 px-1">{example}</code>
        </div>
      </div>
      <SettingRow
        title={t('settings:repository.autoUpdateGitignore')}
        description={t('settings:repository.autoUpdateGitignoreDesc')}
        control={
          <>
            <ResetToDefaultButton
              visible={isFieldOverridden('writeAgentConfigToGitIgnore')}
              defaultLabel="on"
              onReset={() => resetField('writeAgentConfigToGitIgnore')}
              disabled={loading || saving}
            />
            <Switch
              checked={writeAgentConfigToGitIgnore}
              onCheckedChange={(checked) => update({ writeAgentConfigToGitIgnore: checked })}
              disabled={loading || saving}
              aria-label={t('settings:repository.autoUpdateGitignoreDesc')}
            />
          </>
        }
      />
    </div>
  );
};

export default RepositorySettingsCard;

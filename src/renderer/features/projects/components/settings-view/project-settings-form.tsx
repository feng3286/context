import { Check, Loader2, Undo2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Branch } from '@shared/git';
import type { UpdateProjectSettingsError } from '@shared/projects';
import { err, type Result } from '@shared/result';
import type { ProjectSettings } from '@main/core/projects/settings/schema';
import { getRepositoryStore } from '@renderer/features/projects/stores/project-selectors';
import { ProjectBranchSelector } from '@renderer/lib/components/project-branch-selector';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import { Field, FieldDescription, FieldGroup, FieldTitle } from '@renderer/lib/ui/field';
import { Input } from '@renderer/lib/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { Separator } from '@renderer/lib/ui/separator';
import { Switch } from '@renderer/lib/ui/switch';
import { Textarea } from '@renderer/lib/ui/textarea';
import { cn } from '@renderer/utils/utils';

type FormState = {
  preservePatterns: string;
  shellSetup: string;
  tmux: boolean;
  scriptSetup: string;
  scriptRun: string;
  scriptTeardown: string;
  worktreeDirectory: string;
  defaultBranch: Branch | null;
  remote: string;
};

function normalizeScript(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val.join('\n');
  return val ?? '';
}

export function settingsToForm(
  s: ProjectSettings,
  configuredRemote: string,
  remotes: { name: string; url: string }[]
): FormState {
  let defaultBranch: Branch | null = null;
  const configuredRemoteMeta = remotes.find((remote) => remote.name === configuredRemote) ?? {
    name: configuredRemote,
    url: '',
  };
  if (s.defaultBranch) {
    if (typeof s.defaultBranch === 'string') {
      defaultBranch = { type: 'local', branch: s.defaultBranch };
    } else {
      defaultBranch = {
        type: 'remote',
        branch: s.defaultBranch.name,
        remote: configuredRemoteMeta,
      };
    }
  }
  return {
    preservePatterns: (s.preservePatterns ?? []).join('\n'),
    shellSetup: s.shellSetup ?? '',
    tmux: s.tmux ?? false,
    scriptSetup: normalizeScript(s.scripts?.setup),
    scriptRun: normalizeScript(s.scripts?.run),
    scriptTeardown: normalizeScript(s.scripts?.teardown),
    worktreeDirectory: s.worktreeDirectory ?? '',
    defaultBranch,
    remote: s.remote ?? '',
  };
}

export function formToSettings(f: FormState): ProjectSettings {
  let defaultBranch: ProjectSettings['defaultBranch'];
  if (f.defaultBranch) {
    defaultBranch =
      f.defaultBranch.type === 'remote'
        ? { name: f.defaultBranch.branch, remote: true }
        : f.defaultBranch.branch;
  }
  return {
    preservePatterns: f.preservePatterns
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean),
    shellSetup: f.shellSetup || undefined,
    tmux: f.tmux || undefined,
    scripts: {
      setup: f.scriptSetup,
      run: f.scriptRun,
      teardown: f.scriptTeardown,
    },
    worktreeDirectory: f.worktreeDirectory || undefined,
    defaultBranch,
    remote: f.remote || undefined,
  };
}

export interface ProjectSettingsFormProps {
  projectId: string;
  initial: ProjectSettings;
  onSuccess: () => void;
  save: (settings: ProjectSettings) => Promise<Result<void, UpdateProjectSettingsError>>;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
const EMPTY_REMOTES: { name: string; url: string }[] = [];

export const ProjectSettingsForm = observer(function ProjectSettingsForm({
  projectId,
  initial,
  onSuccess,
  save,
}: ProjectSettingsFormProps) {
  const { t } = useTranslation();
  const repo = getRepositoryStore(projectId);
  const remotes = repo?.remotes ?? EMPTY_REMOTES;
  const configuredRemote = repo?.configuredRemote.name ?? 'origin';

  const baseline = useMemo(
    () => settingsToForm(initial, configuredRemote, remotes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, configuredRemote, remotes]
  );
  const [form, setForm] = useState<FormState>(baseline);
  const [savedForm, setSavedForm] = useState<FormState>(baseline);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [worktreeDirectoryError, setWorktreeDirectoryError] = useState<string | null>(null);

  const formSnapshot = useMemo(() => JSON.stringify(form), [form]);
  const savedSnapshot = useMemo(() => JSON.stringify(savedForm), [savedForm]);
  const dirty = formSnapshot !== savedSnapshot;
  const saving = saveStatus === 'saving';
  const saved = saveStatus === 'saved' && !dirty;
  const saveDisabled = saving || !dirty;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveStatus((current) => (current === 'idle' ? current : 'idle'));
    if (key === 'worktreeDirectory' && worktreeDirectoryError) {
      setWorktreeDirectoryError(null);
    }
  }

  async function handleSave() {
    const formAtSubmit = form;
    setSaveStatus('saving');

    const result = await save(formToSettings(formAtSubmit)).catch(() => err({ type: 'error' }));

    if (result.success) {
      setWorktreeDirectoryError(null);
      setSavedForm(formAtSubmit);
      setSaveStatus('saved');
      onSuccess();
      return;
    }

    if (result.error.type === 'invalid-worktree-directory') {
      setWorktreeDirectoryError(t('projectSettings:worktreeDir.invalidDirError'));
      setSaveStatus('idle');
      return;
    }

    setWorktreeDirectoryError(null);
    setSaveStatus('error');
  }

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full h-full overflow-hidden px-10">
      <h1 className="text-lg font-medium pt-10 pb-5">{t('projectSettings:title')}</h1>
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none' }}>
        <FieldGroup>
          <Field>
            <FieldTitle>{t('projectSettings:preservePatterns.title')}</FieldTitle>
            <FieldDescription>{t('projectSettings:preservePatterns.description')}</FieldDescription>
            <Textarea
              rows={5}
              placeholder={t('projectSettings:preservePatterns.placeholder')}
              value={form.preservePatterns}
              onChange={(e) => update('preservePatterns', e.target.value)}
            />
          </Field>

          <Separator />

          <Field>
            <FieldTitle>{t('projectSettings:worktreeDir.title')}</FieldTitle>
            <FieldDescription>{t('projectSettings:worktreeDir.description')}</FieldDescription>
            <div className="relative">
              <Input
                aria-invalid={worktreeDirectoryError ? true : undefined}
                className={cn(worktreeDirectoryError ? 'pr-44' : undefined)}
                placeholder={t('projectSettings:worktreeDir.placeholder')}
                value={form.worktreeDirectory}
                onChange={(e) => update('worktreeDirectory', e.target.value)}
              />
              {worktreeDirectoryError ? (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-red-500">
                  {t('projectSettings:worktreeDir.invalidDirError')}
                </span>
              ) : null}
            </div>
          </Field>

          <Separator />

          <Field>
            <FieldTitle>{t('projectSettings:defaultBranch.title')}</FieldTitle>
            <FieldDescription>{t('projectSettings:defaultBranch.description')}</FieldDescription>
            <ProjectBranchSelector
              projectId={projectId}
              value={form.defaultBranch ?? undefined}
              onValueChange={(branch: Branch) => update('defaultBranch', branch)}
            />
          </Field>

          <Separator />

          <Field>
            <FieldTitle>{t('projectSettings:remote.title')}</FieldTitle>
            <FieldDescription>{t('projectSettings:remote.description')}</FieldDescription>
            <Select
              value={form.remote || 'origin'}
              onValueChange={(value) => update('remote', value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('projectSettings:remote.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {remotes.length > 0 ? (
                  remotes.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                      <span className="ml-2 text-xs text-muted-foreground">{r.url}</span>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="origin">origin</SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>

          <Separator />

          <Field>
            <FieldTitle>{t('projectSettings:shellSetup.title')}</FieldTitle>
            <FieldDescription>{t('projectSettings:shellSetup.description')}</FieldDescription>
            <Textarea
              rows={3}
              placeholder={t('projectSettings:shellSetup.placeholder')}
              value={form.shellSetup}
              onChange={(e) => update('shellSetup', e.target.value)}
            />
          </Field>

          <Separator />

          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldTitle>{t('projectSettings:tmux.title')}</FieldTitle>
              <FieldDescription>{t('projectSettings:tmux.description')}</FieldDescription>
            </div>
            <Switch checked={form.tmux} onCheckedChange={(checked) => update('tmux', checked)} />
          </Field>

          <Separator />

          <div className="flex flex-col gap-4">
            <div>
              <FieldTitle>{t('projectSettings:lifecycle.title')}</FieldTitle>
              <FieldDescription className="mt-1">
                {t('projectSettings:lifecycle.description')}
                <span> </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="group inline-flex h-auto cursor-pointer items-center gap-1 px-0 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline focus-visible:outline-none focus-visible:ring-0"
                  onClick={() => rpc.app.openExternal('https://github.com/feng3286/context#readme')}
                >
                  <span className="font-mono text-xs transition-colors group-hover:text-foreground">
                    {t('projectSettings:lifecycle.docsLink')}
                  </span>
                  <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                    ↗
                  </span>
                </Button>
                <span> {t('projectSettings:lifecycle.docsSuffix')}</span>
              </FieldDescription>
            </div>

            <Field>
              <FieldTitle className="text-xs font-normal text-muted-foreground">
                {t('projectSettings:lifecycle.setup')}
              </FieldTitle>
              <Textarea
                rows={3}
                placeholder={t('projectSettings:lifecycle.setupPlaceholder')}
                value={form.scriptSetup}
                onChange={(e) => update('scriptSetup', e.target.value)}
              />
            </Field>

            <Field>
              <FieldTitle className="text-xs font-normal text-muted-foreground">
                {t('projectSettings:lifecycle.run')}
              </FieldTitle>
              <Textarea
                rows={3}
                placeholder={t('projectSettings:lifecycle.runPlaceholder')}
                value={form.scriptRun}
                onChange={(e) => update('scriptRun', e.target.value)}
              />
            </Field>

            <Field>
              <FieldTitle className="text-xs font-normal text-muted-foreground">
                {t('projectSettings:lifecycle.teardown')}
              </FieldTitle>
              <Textarea
                rows={3}
                placeholder={t('projectSettings:lifecycle.teardownPlaceholder')}
                value={form.scriptTeardown}
                onChange={(e) => update('scriptTeardown', e.target.value)}
              />
            </Field>
          </div>
        </FieldGroup>
      </div>
      <div className="flex justify-end gap-2 pt-5 pb-10">
        <Button
          variant="outline"
          onClick={() => {
            setForm(savedForm);
            setWorktreeDirectoryError(null);
            if (saveStatus === 'error') setSaveStatus('idle');
          }}
          disabled={!dirty || saving}
        >
          <Undo2 />
        </Button>
        <ConfirmButton onClick={() => void handleSave()} disabled={saveDisabled}>
          <span className="inline-flex min-w-22 items-center justify-center gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {!saving && saved && <Check className="size-4" aria-hidden="true" />}
            {saving
              ? t('projectSettings:saving')
              : saved
                ? t('projectSettings:saved')
                : t('projectSettings:save')}
          </span>
        </ConfirmButton>
      </div>
    </div>
  );
});

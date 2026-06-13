import { Info, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomAgentEntry } from '@shared/custom-agent';
import { Button } from '@renderer/lib/ui/button';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import { Switch } from '@renderer/lib/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';

interface CustomAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: CustomAgentEntry) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  existing?: CustomAgentEntry | null;
  existingIds: string[];
}

type EnvEntry = { key: string; value: string };

type FormState = {
  id: string;
  name: string;
  cli: string;
  autoApproveFlag: string;
  initialPromptFlag: string;
  defaultArgs: string;
  resumeFlag: string;
  sessionIdFlag: string;
  useKeystrokeInjection: boolean;
  installCommand: string;
  docUrl: string;
  envEntries: EnvEntry[];
  extraArgs: string;
};

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  cli: '',
  autoApproveFlag: '',
  initialPromptFlag: '',
  defaultArgs: '',
  resumeFlag: '',
  sessionIdFlag: '',
  useKeystrokeInjection: false,
  installCommand: '',
  docUrl: '',
  envEntries: [],
  extraArgs: '',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CustomAgentModal: React.FC<CustomAgentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  existing,
  existingIds,
}) => {
  const { t } = useTranslation();
  const isEdit = existing !== null && existing !== undefined;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      setForm({
        id: existing.id,
        name: existing.name,
        cli: existing.cli,
        autoApproveFlag: existing.autoApproveFlag ?? '',
        initialPromptFlag: existing.initialPromptFlag ?? '',
        defaultArgs: existing.defaultArgs?.join(' ') ?? '',
        resumeFlag: existing.resumeFlag ?? '',
        sessionIdFlag: existing.sessionIdFlag ?? '',
        useKeystrokeInjection: existing.useKeystrokeInjection ?? false,
        installCommand: existing.installCommand ?? '',
        docUrl: existing.docUrl ?? '',
        envEntries: existing.env
          ? Object.entries(existing.env).map(([key, value]) => ({ key, value }))
          : [],
        extraArgs: existing.extraArgs ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [isOpen, isEdit, existing]);

  const handleChange = useCallback((field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        const nextId = !isEdit ? slugify(value) : prev.id;
        return { ...prev, name: value, id: nextId };
      });
    },
    [isEdit]
  );

  const setEnvEntry = useCallback((index: number, entryUpdate: Partial<EnvEntry>) => {
    setForm((prev) => {
      const next = [...prev.envEntries];
      next[index] = { ...next[index], ...entryUpdate };
      return { ...prev, envEntries: next };
    });
  }, []);

  const addEnvEntry = useCallback(() => {
    setForm((prev) => ({ ...prev, envEntries: [...prev.envEntries, { key: '', value: '' }] }));
  }, []);

  const removeEnvEntry = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      envEntries: prev.envEntries.filter((_, i) => i !== index),
    }));
  }, []);

  const idConflict = useMemo(() => {
    const id = form.id.trim();
    if (!id) return null;
    if (isEdit && id === existing?.id) return null;
    if (existingIds.includes(id)) return t('settings:customAgent.idConflict');
    return null;
  }, [form.id, isEdit, existing?.id, existingIds, t]);

  const isValid = useMemo(() => {
    return form.name.trim().length > 0 && form.cli.trim().length > 0 && !idConflict;
  }, [form.name, form.cli, idConflict]);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const envRecord: Record<string, string> = {};
      for (const { key, value } of form.envEntries) {
        const k = key.trim();
        if (k && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
          envRecord[k] = value;
        }
      }

      const entry: CustomAgentEntry = {
        id: form.id.trim(),
        name: form.name.trim(),
        cli: form.cli.trim(),
        autoApproveFlag: form.autoApproveFlag.trim() || undefined,
        initialPromptFlag: form.initialPromptFlag.trim() || undefined,
        defaultArgs: form.defaultArgs.trim() ? form.defaultArgs.trim().split(/\s+/) : undefined,
        resumeFlag: form.resumeFlag.trim() || undefined,
        sessionIdFlag: form.sessionIdFlag.trim() || undefined,
        useKeystrokeInjection: form.useKeystrokeInjection,
        installCommand: form.installCommand.trim() || undefined,
        docUrl: form.docUrl.trim() || undefined,
        env: Object.keys(envRecord).length > 0 ? envRecord : undefined,
        extraArgs: form.extraArgs.trim() || undefined,
      };
      await onSave(entry);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [form, isValid, onSave, onClose]);

  const handleDelete = useCallback(async () => {
    if (!onDelete || !existing) return;
    await onDelete(existing.id);
    onClose();
  }, [onDelete, existing, onClose]);

  const previewCommand = useMemo(() => {
    const parts: string[] = [];
    if (form.cli) parts.push(form.cli);
    if (form.defaultArgs) parts.push(form.defaultArgs);
    if (form.extraArgs) parts.push(form.extraArgs);
    if (form.autoApproveFlag) parts.push(form.autoApproveFlag);
    if (form.initialPromptFlag) parts.push(form.initialPromptFlag);
    parts.push('{prompt}');
    return parts.join(' ');
  }, [form]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="border-b border-border/60">
          <DialogHeader className="flex-row items-start gap-4 px-6 py-4">
            <DialogTitle className="text-lg font-semibold">
              {isEdit ? t('settings:customAgent.edit') : t('settings:customAgent.add')}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-name" className="text-sm font-medium">
                  {t('settings:customAgent.name')} <span className="text-red-500">*</span>
                </Label>
                <FieldTooltip content={t('settings:customAgent.nameDesc')} />
              </div>
              <Input
                id="ca-name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Agent"
                className="text-sm"
              />
            </div>

            {/* ID */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-id" className="text-sm font-medium">
                  {t('settings:customAgent.id')} <span className="text-red-500">*</span>
                </Label>
                <FieldTooltip content={t('settings:customAgent.idDesc')} />
              </div>
              <Input
                id="ca-id"
                value={form.id}
                onChange={(e) => handleChange('id', isEdit ? form.id : slugify(e.target.value))}
                placeholder="my-agent"
                className="font-mono text-sm"
                disabled={isEdit}
              />
              {idConflict && <p className="text-xs text-destructive">{idConflict}</p>}
            </div>

            {/* CLI Command */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-cli" className="text-sm font-medium">
                  {t('settings:customAgent.cli')} <span className="text-red-500">*</span>
                </Label>
                <FieldTooltip content={t('settings:customAgent.cliDesc')} />
              </div>
              <Input
                id="ca-cli"
                value={form.cli}
                onChange={(e) => handleChange('cli', e.target.value)}
                placeholder="my-agent"
                className="font-mono text-sm"
              />
            </div>

            {/* Auto-approve Flag */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-auto" className="text-sm font-medium">
                  {t('settings:customAgent.autoApproveFlag')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.autoApproveFlagDesc')} />
              </div>
              <Input
                id="ca-auto"
                value={form.autoApproveFlag}
                onChange={(e) => handleChange('autoApproveFlag', e.target.value)}
                placeholder="--yolo"
                className="font-mono text-sm"
              />
            </div>

            {/* Initial Prompt Flag */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-prompt" className="text-sm font-medium">
                  {t('settings:customAgent.initialPromptFlag')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.initialPromptFlagDesc')} />
              </div>
              <Input
                id="ca-prompt"
                value={form.initialPromptFlag}
                onChange={(e) => handleChange('initialPromptFlag', e.target.value)}
                placeholder="-p"
                className="font-mono text-sm"
              />
            </div>

            {/* Default Args */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-args" className="text-sm font-medium">
                  {t('settings:customAgent.defaultArgs')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.defaultArgsDesc')} />
              </div>
              <Input
                id="ca-args"
                value={form.defaultArgs}
                onChange={(e) => handleChange('defaultArgs', e.target.value)}
                placeholder="run --interactive"
                className="font-mono text-sm"
              />
            </div>

            {/* Resume Flag */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-resume" className="text-sm font-medium">
                  {t('settings:customAgent.resumeFlag')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.resumeFlagDesc')} />
              </div>
              <Input
                id="ca-resume"
                value={form.resumeFlag}
                onChange={(e) => handleChange('resumeFlag', e.target.value)}
                placeholder="--resume"
                className="font-mono text-sm"
              />
            </div>

            {/* Session ID Flag */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-session" className="text-sm font-medium">
                  {t('settings:customAgent.sessionIdFlag')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.sessionIdFlagDesc')} />
              </div>
              <Input
                id="ca-session"
                value={form.sessionIdFlag}
                onChange={(e) => handleChange('sessionIdFlag', e.target.value)}
                placeholder="--session-id"
                className="font-mono text-sm"
              />
            </div>

            {/* Keystroke Injection */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-keystroke" className="text-sm font-medium">
                  {t('settings:customAgent.keystrokeInjection')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.keystrokeInjectionDesc')} />
              </div>
              <Switch
                id="ca-keystroke"
                checked={form.useKeystrokeInjection}
                onCheckedChange={(v) => handleChange('useKeystrokeInjection', v)}
              />
            </div>

            {/* Install Command */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-install" className="text-sm font-medium">
                  {t('settings:customAgent.installCommand')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.installCommandDesc')} />
              </div>
              <Input
                id="ca-install"
                value={form.installCommand}
                onChange={(e) => handleChange('installCommand', e.target.value)}
                placeholder="npm install -g my-agent"
                className="font-mono text-sm"
              />
            </div>

            {/* Doc URL */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-doc" className="text-sm font-medium">
                  {t('settings:customAgent.docUrl')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.docUrlDesc')} />
              </div>
              <Input
                id="ca-doc"
                value={form.docUrl}
                onChange={(e) => handleChange('docUrl', e.target.value)}
                placeholder="https://..."
                className="font-mono text-sm"
              />
            </div>

            {/* Extra Args */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ca-extra" className="text-sm font-medium">
                  {t('settings:customAgent.extraArgs')}
                </Label>
                <FieldTooltip content={t('settings:customAgent.extraArgsDesc')} />
              </div>
              <Input
                id="ca-extra"
                value={form.extraArgs}
                onChange={(e) => handleChange('extraArgs', e.target.value)}
                placeholder="--some-extra-arg"
                className="font-mono text-sm"
              />
            </div>

            {/* Environment Variables */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{t('settings:customAgent.envVars')}</Label>
                <FieldTooltip content={t('settings:customAgent.envVarsDesc')} />
              </div>
              <div className="space-y-2">
                {form.envEntries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={entry.key}
                      onChange={(e) => setEnvEntry(i, { key: e.target.value })}
                      placeholder={t('settings:customAgent.envKey')}
                      className="min-w-0 flex-1 font-mono text-sm"
                    />
                    <Input
                      value={entry.value}
                      onChange={(e) => setEnvEntry(i, { value: e.target.value })}
                      placeholder={t('settings:customAgent.envValue')}
                      className="min-w-0 flex-1 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvEntry(i)}
                      className="h-8 w-8 shrink-0"
                      aria-label={t('common:remove')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvEntry}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('common:addVariable')}
                </Button>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {t('common:commandPreview')}
              </div>
              <code className="block break-all font-mono text-sm text-foreground">
                {previewCommand}
              </code>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4">
          <div>
            {isEdit && onDelete && (
              <ConfirmButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={saving}
              >
                {t('common:delete')}
              </ConfirmButton>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {t('common:cancel')}
            </Button>
            <ConfirmButton
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !isValid}
            >
              {saving ? t('common:saving') : t('common:save')}
            </ConfirmButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const FieldTooltip: React.FC<{ content: string }> = ({ content }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label={content}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px] text-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default CustomAgentModal;

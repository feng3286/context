import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PROMPT_TEMPLATE_CATEGORIES,
  type PromptTemplate,
  type PromptTemplateCategory,
} from '@shared/prompt-templates';
import { Button } from '@renderer/lib/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import { Switch } from '@renderer/lib/ui/switch';
import { Textarea } from '@renderer/lib/ui/textarea';

interface PromptTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: PromptTemplate) => void;
  onDelete?: (id: string) => void;
  existing?: PromptTemplate | null;
  existingIds: string[];
}

type FormState = {
  id: string;
  name: string;
  content: string;
  category: PromptTemplateCategory;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  content: '',
  category: 'custom',
  enabled: true,
};

function generateId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || `template-${Date.now()}`
  );
}

function buildFormState(existing?: PromptTemplate | null): FormState {
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      content: existing.content,
      category: existing.category,
      enabled: existing.enabled,
    };
  }
  return EMPTY_FORM;
}

export function PromptTemplateEditor({
  isOpen,
  onClose,
  onSave,
  onDelete,
  existing,
  existingIds,
}: PromptTemplateEditorProps) {
  const { t } = useTranslation();
  const isEdit = !!existing;

  // Use a key that resets when the modal opens with different `existing`
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [idError, setIdError] = useState<string | null>(null);

  // Initialize form on open via onOpenChange callback
  const handleOpenChangeSafe = useCallback(
    (open: boolean) => {
      if (open) {
        setForm(buildFormState(existing));
        setIdError(null);
      } else {
        onClose();
      }
    },
    [existing, onClose]
  );

  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        // Auto-generate ID from name for new templates
        if (field === 'name' && !isEdit) {
          next.id = generateId(value as string);
        }
        return next;
      });
    },
    [isEdit]
  );

  const validate = useCallback((): boolean => {
    if (!form.name.trim()) return false;
    if (!form.content.trim()) return false;
    if (!isEdit) {
      const generatedId = form.id.trim();
      if (!generatedId) {
        setIdError('ID is required');
        return false;
      }
      const validPattern = /^[a-z0-9][a-z0-9-]*$/;
      if (!validPattern.test(generatedId)) {
        setIdError('ID must be lowercase alphanumeric with hyphens');
        return false;
      }
      if (existingIds.includes(generatedId)) {
        setIdError('This ID already exists');
        return false;
      }
    }
    setIdError(null);
    return true;
  }, [form, isEdit, existingIds]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    onSave({
      id: isEdit ? existing!.id : form.id.trim(),
      name: form.name.trim(),
      content: form.content.trim(),
      category: form.category,
      enabled: form.enabled,
      order: isEdit ? existing!.order : 0,
      isSystem: isEdit ? existing!.isSystem : false,
    });
  }, [form, isEdit, existing, onSave, validate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const categoryOptions = useMemo(
    () =>
      PROMPT_TEMPLATE_CATEGORIES.map((cat) => ({
        value: cat,
        label: t(`settings:promptTemplates.categories.${cat}`),
      })),
    [t]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChangeSafe}>
      <DialogContent className="max-w-lg" onKeyDownCapture={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('settings:promptTemplates.edit') : t('settings:promptTemplates.create')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt-name">{t('settings:promptTemplates.name')}</Label>
            <Input
              id="pt-name"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder={t('settings:promptTemplates.namePlaceholder')}
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt-category">{t('settings:promptTemplates.category')}</Label>
            <select
              id="pt-category"
              value={form.category}
              onChange={(e) => updateField('category', e.target.value as PromptTemplateCategory)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt-content">{t('settings:promptTemplates.content')}</Label>
            <Textarea
              id="pt-content"
              value={form.content}
              onChange={(e) => updateField('content', e.target.value)}
              placeholder={t('settings:promptTemplates.contentPlaceholder')}
              className="min-h-32 resize-none"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pt-enabled">{t('settings:promptTemplates.enabled')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings:promptTemplates.enabledDesc')}
              </p>
            </div>
            <Switch
              id="pt-enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => updateField('enabled', checked)}
            />
          </div>

          {/* ID error for new templates */}
          {!isEdit && idError && <p className="text-xs text-destructive">{idError}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <div>
            {isEdit && !existing?.isSystem && onDelete ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm(t('settings:promptTemplates.confirmDelete'))) {
                    onDelete(existing.id);
                    onClose();
                  }
                }}
              >
                {t('common:delete')}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common:cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.content.trim()}>
              {isEdit ? t('common:save') : t('settings:promptTemplates.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PromptTemplateEditor;

import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PROMPT_TEMPLATE_CATEGORIES, type PromptTemplate } from '@shared/prompt-templates';
import PromptTemplateEditor from '@renderer/features/settings/components/PromptTemplateEditor';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { Button } from '@renderer/lib/ui/button';
import { Switch } from '@renderer/lib/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';

const ICON_BUTTON =
  'rounded-md p-1.5 text-muted-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function groupByCategory(templates: PromptTemplate[]) {
  const groups = new Map<string, PromptTemplate[]>();
  const sorted = [...templates].sort((a, b) => a.order - b.order);
  for (const tpl of sorted) {
    const group = groups.get(tpl.category) ?? [];
    group.push(tpl);
    groups.set(tpl.category, group);
  }
  return groups;
}

function TemplateRow({
  template,
  onToggle,
  onEdit,
  onDelete,
}: {
  template: PromptTemplate;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (template: PromptTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background-1 px-3 py-2.5">
      <GripVertical className="size-4 shrink-0 text-muted-foreground/40" />
      <Switch
        checked={template.enabled}
        onCheckedChange={(checked) => onToggle(template.id, checked)}
        aria-label={t('settings:promptTemplates.toggleEnabled', { name: template.name })}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {template.name}
            {template.isSystem && (
              <span className="ml-1.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t('settings:promptTemplates.builtIn')}
              </span>
            )}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{template.content}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <TooltipProvider delay={150}>
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                onClick={() => onEdit(template)}
                className={ICON_BUTTON}
                aria-label={t('common:edit')}
              >
                <Pencil className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t('common:edit')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {!template.isSystem && (
          <TooltipProvider delay={150}>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={() => onDelete(template.id)}
                  className="rounded-md p-1.5 text-destructive transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={t('common:delete')}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t('common:delete')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export function PromptTemplatesCard() {
  const { t } = useTranslation();
  const { value: rawTemplates, update: updateTemplates } = useAppSettingsKey('promptTemplates');
  const templates = useMemo(
    () => (Array.isArray(rawTemplates) ? rawTemplates : []),
    [rawTemplates]
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);

  const existingIds = useMemo(() => templates.map((t) => t.id), [templates]);

  const handleSave = useCallback(
    (entry: PromptTemplate) => {
      const existing = templates.find((t) => t.id === entry.id);
      const next = existing
        ? templates.map((t) => (t.id === entry.id ? { ...t, ...entry } : t))
        : [...templates, entry];
      updateTemplates(next);
      setEditorOpen(false);
      setEditingTemplate(null);
    },
    [templates, updateTemplates]
  );

  const handleDelete = useCallback(
    (id: string) => {
      updateTemplates(templates.filter((t) => t.id !== id));
    },
    [templates, updateTemplates]
  );

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      updateTemplates(templates.map((t) => (t.id === id ? { ...t, enabled } : t)));
    },
    [templates, updateTemplates]
  );

  const groups = useMemo(() => groupByCategory(templates), [templates]);

  const categoryOrder = useMemo(() => {
    const presentCategories = new Set(templates.map((t) => t.category));
    return PROMPT_TEMPLATE_CATEGORIES.filter((c) => presentCategories.has(c));
  }, [templates]);

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingTemplate(null);
            setEditorOpen(true);
          }}
          className="gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          {t('settings:promptTemplates.add')}
        </Button>
      </div>

      {/* Grouped template list */}
      {templates.length > 0 ? (
        <div className="space-y-4">
          {categoryOrder.map((category) => {
            const items = groups.get(category) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={category} className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground">
                  {t(`settings:promptTemplates.categories.${category}`)} ({items.length})
                </h4>
                {items.map((tpl) => (
                  <TemplateRow
                    key={tpl.id}
                    template={tpl}
                    onToggle={handleToggle}
                    onEdit={(tpl) => {
                      setEditingTemplate(tpl);
                      setEditorOpen(true);
                    }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('settings:promptTemplates.empty')}
        </p>
      )}

      {/* Editor modal */}
      <PromptTemplateEditor
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingTemplate(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
        existing={editingTemplate}
        existingIds={existingIds.filter((id) => id !== editingTemplate?.id)}
      />
    </div>
  );
}

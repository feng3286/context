import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidSkillName } from '@shared/skills/validation';
import { rpc } from '@renderer/lib/ipc';
import { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { useCloseGuard } from '@renderer/lib/modal/use-close-guard';
import { Button } from '@renderer/lib/ui/button';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import { Textarea } from '@renderer/lib/ui/textarea';
import { captureTelemetry } from '@renderer/utils/telemetryClient';

type Props = BaseModalProps<void>;

export function CreateSkillModal({ onSuccess, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useCloseGuard(isCreating);

  const handleCreateSkill = async () => {
    setCreateError(null);

    const trimmedName = name.trim();
    if (!isValidSkillName(trimmedName)) {
      setCreateError(t('skills:createSkill.nameError'));
      return;
    }
    if (!description.trim()) {
      setCreateError(t('skills:createSkill.descriptionError'));
      return;
    }

    setIsCreating(true);
    try {
      const result = await rpc.skills.create({
        name: trimmedName,
        description: description.trim(),
        content: content.trim(),
      });

      if (!result.success) {
        setCreateError(result.error || t('skills:createSkill.failed'));
        return;
      }

      captureTelemetry('skill_created');
      onSuccess();
      void queryClient.invalidateQueries({ queryKey: ['skills', 'catalog'] });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t('skills:createSkill.failed'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col gap-0.5">
          <DialogTitle>{t('skills:newSkill')}</DialogTitle>
        </div>
      </DialogHeader>

      <DialogContentArea>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name" className="text-xs">
              {t('skills:createSkill.name')}
            </Label>
            <Input
              id="skill-name"
              placeholder="my-skill"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCreateError(null);
              }}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">{t('skills:createSkill.nameHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-desc" className="text-xs">
              {t('skills:createSkill.description')}
            </Label>
            <Input
              id="skill-desc"
              placeholder={t('skills:createSkill.descriptionPlaceholder')}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setCreateError(null);
              }}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-content" className="text-xs">
              {t('skills:createSkill.instructions')}
            </Label>
            <Textarea
              id="skill-content"
              placeholder={t('skills:createSkill.instructionsPlaceholder')}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setCreateError(null);
              }}
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              {t('skills:createSkill.instructionsHelp')}
            </p>
          </div>

          {createError && <p className="text-xs text-destructive">{createError}</p>}
        </div>
      </DialogContentArea>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isCreating}>
          {t('skills:createSkill.cancel')}
        </Button>
        <ConfirmButton
          type="button"
          onClick={() => void handleCreateSkill()}
          size="sm"
          disabled={isCreating}
        >
          {isCreating ? t('skills:createSkill.creating') : t('skills:createSkill.create')}
        </ConfirmButton>
      </DialogFooter>
    </>
  );
}

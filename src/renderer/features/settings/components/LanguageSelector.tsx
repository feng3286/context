import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { LANGUAGE_NAMES, type SupportedLanguage } from '@renderer/i18n/config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { SettingRow } from './SettingRow';

export function LanguageSelector() {
  const { t } = useTranslation();
  const { value: language, update, isLoading, isOverridden, reset } = useAppSettingsKey('language');

  const currentLanguage = (language as SupportedLanguage) ?? 'en';

  return (
    <SettingRow
      title={t('settings:general.language.label')}
      description={t('settings:general.language.description')}
      control={
        <div className="flex items-center gap-2">
          {isOverridden && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => reset()}
              disabled={isLoading}
            >
              Reset
            </button>
          )}
          <Select
            value={currentLanguage}
            onValueChange={(lng) => update(lng as unknown as Partial<SupportedLanguage>)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-auto shrink-0 gap-2 [&>span]:line-clamp-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-max">
              {(Object.keys(LANGUAGE_NAMES) as SupportedLanguage[]).map((lng) => (
                <SelectItem key={lng} value={lng}>
                  {LANGUAGE_NAMES[lng]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}

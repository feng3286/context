import { createRPCController } from '@/shared/ipc/rpc';
import { applyNativeTheme, updateApplicationMenu } from '@main/app/menu';
import { setMenuLanguage } from '@main/lib/i18n/menu';
import type { SupportedLanguage } from '@renderer/i18n/config';
import { appSettingsService, type AppSettings, type AppSettingsKey } from './settings-service';

export const appSettingsController = createRPCController({
  get: <T extends AppSettingsKey>(key: T): Promise<AppSettings[T]> => appSettingsService.get(key),

  getAll: (): Promise<AppSettings> => appSettingsService.getAll(),

  getWithMeta: <T extends AppSettingsKey>(
    key: T
  ): Promise<{
    value: AppSettings[T];
    defaults: AppSettings[T];
    overrides: Partial<AppSettings[T]>;
  }> => appSettingsService.getWithMeta(key),

  update: async <T extends AppSettingsKey>(key: T, value: AppSettings[T]): Promise<void> => {
    await appSettingsService.update(key, value);

    // Rebuild menu when language changes
    if (key === 'language') {
      setMenuLanguage(value as SupportedLanguage);
      updateApplicationMenu();
    }

    // Update native theme when theme changes
    if (key === 'theme') {
      applyNativeTheme();
    }
  },

  reset: async <T extends AppSettingsKey>(key: T): Promise<void> => {
    await appSettingsService.reset(key);

    if (key === 'language') {
      const defaults = await appSettingsService.get('language');
      setMenuLanguage(defaults as SupportedLanguage);
      updateApplicationMenu();
    }
    if (key === 'theme') {
      applyNativeTheme();
    }
  },

  resetField: <T extends AppSettingsKey>(key: T, field: string): Promise<void> =>
    appSettingsService.resetField(key, field as keyof AppSettings[T]),
});

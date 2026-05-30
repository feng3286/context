import { useEffect, useRef } from 'react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { i18n, type SupportedLanguage } from './config';

export function useLanguageSync() {
  const { value: language, isLoading } = useAppSettingsKey('language');
  const initializedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !language) return;
    const lng = language as SupportedLanguage;
    if (!initializedRef.current) {
      void i18n.changeLanguage(lng);
      initializedRef.current = true;
      return;
    }
    void i18n.changeLanguage(lng);
  }, [language, isLoading]);

  return { currentLanguage: (language as SupportedLanguage) ?? 'zh' };
}

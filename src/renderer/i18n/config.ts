import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import zh from './locales/zh/translation.json';

export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  zh: '中文',
};

let i18nInitialized = false;

export async function initI18n(initialLanguage: SupportedLanguage = 'zh') {
  if (i18nInitialized) return;
  await i18n.use(initReactI18next).init({
    resources: {
      en: { ...en },
      zh: { ...zh },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
  });
  i18nInitialized = true;
}

export { i18n };

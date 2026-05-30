import { Monitor, Moon, Sun } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '@shared/app-settings';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { captureTelemetry } from '@renderer/utils/telemetryClient';

const ThemeCard: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const handleSetTheme = (next: Theme) => {
    if (theme !== next) {
      captureTelemetry('setting_changed', { setting: 'theme' });
    }
    setTheme(next);
  };

  const buttonBase =
    'flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3';
  const activeClass = 'bg-background-2';
  const inactiveClass =
    'border-border/60 bg-background text-foreground-muted hover:bg-background-1';

  return (
    <div className="grid gap-3 text-sm">
      <div>
        <div className="font-medium text-foreground">{t('settings:interface.theme.title')}</div>
        <div className="text-foreground-muted">{t('settings:interface.theme.description')}</div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
        <button
          type="button"
          onClick={() => handleSetTheme(null)}
          className={`${buttonBase} ${theme === null ? activeClass : inactiveClass}`}
          aria-pressed={theme === null}
          aria-label={t('settings:interface.theme.systemAria')}
        >
          <Monitor className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-center">{t('settings:interface.theme.system')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleSetTheme('emlight')}
          className={`${buttonBase} ${theme === 'emlight' ? activeClass : inactiveClass}`}
          aria-pressed={theme === 'emlight'}
          aria-label={t('settings:interface.theme.lightAria')}
        >
          <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-center">{t('settings:interface.theme.light')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleSetTheme('emdark')}
          className={`${buttonBase} ${theme === 'emdark' ? activeClass : inactiveClass}`}
          aria-pressed={theme === 'emdark'}
          aria-label={t('settings:interface.theme.darkAria')}
        >
          <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-center">{t('settings:interface.theme.dark')}</span>
        </button>
      </div>
    </div>
  );
};

export default ThemeCard;

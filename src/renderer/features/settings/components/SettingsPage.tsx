import { ExternalLink } from 'lucide-react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { rpc } from '@renderer/lib/ipc';
import { Separator } from '@renderer/lib/ui/separator';
import { cn } from '@renderer/utils/utils';
// Context account feature disabled: auth.context.sh not deployed yet
// import { AccountTab } from './AccountTab';
import { CliAgentsList } from './CliAgentsList';
import DefaultAgentSettingsCard from './DefaultAgentSettingsCard';
import HiddenToolsSettingsCard from './HiddenToolsSettingsCard';
import IntegrationsCard from './IntegrationsCard';
import KeyboardSettingsCard from './KeyboardSettingsCard';
import { LanguageSelector } from './LanguageSelector';
import { MarketplacesCard } from './MarketplacesCard';
import NotificationSettingsCard from './NotificationSettingsCard';
import RepositorySettingsCard from './RepositorySettingsCard';
import { ReviewPromptResetButton, ReviewPromptSettingsCard } from './ReviewPromptSettingsCard';
import { AutoGenerateTaskNamesRow, AutoTrustWorktreesRow } from './TaskSettingsRows';
import TelemetryCard from './TelemetryCard';
import TerminalSettingsCard from './TerminalSettingsCard';
import ThemeCard from './ThemeCard';
import { UpdateCard } from './UpdateCard';

export type SettingsPageTab =
  | 'general'
  | 'account'
  | 'clis-models'
  | 'integrations'
  | 'repository'
  | 'interface'
  | 'marketplaces'
  | 'docs';

interface SectionConfig {
  title?: string;
  action?: React.ReactNode;
  component: React.ReactNode;
}

export function SettingsPage({
  tab: activeTab,
  onTabChange,
}: {
  tab: SettingsPageTab;
  onTabChange: (tab: SettingsPageTab) => void;
}) {
  const { t } = useTranslation();

  const handleDocsClick = useCallback(() => {
    rpc.app.openExternal('https://github.com/feng3286/context#readme');
  }, []);

  const tabs: Array<{
    id: SettingsPageTab;
    label: string;
    isExternal?: boolean;
  }> = [
    { id: 'general', label: t('settings:tabs.general') },
    // Context account feature disabled: auth.context.sh not deployed yet
    // { id: 'account', label: t('settings:tabs.account') },
    { id: 'clis-models', label: t('settings:tabs.agents') },
    { id: 'integrations', label: t('settings:tabs.integrations') },
    { id: 'repository', label: t('settings:tabs.repository') },
    { id: 'interface', label: t('settings:tabs.interface') },
    { id: 'marketplaces', label: t('settings:tabs.marketplaces') },
    { id: 'docs', label: t('settings:tabs.docs'), isExternal: true },
  ];

  const tabContent: Record<
    string,
    { title: string; description: string; sections: SectionConfig[] }
  > = {
    general: {
      title: t('settings:general.title'),
      description: t('settings:general.description'),
      sections: [
        { component: <LanguageSelector /> },
        // TelemetryCard commented out — privacy & telemetry setting disabled
        // { component: <TelemetryCard /> },
        { component: <AutoGenerateTaskNamesRow /> },
        { component: <AutoTrustWorktreesRow /> },
        { component: <NotificationSettingsCard /> },
        { component: <UpdateCard /> },
      ],
    },
    account: {
      title: t('settings:account.title'),
      description: t('settings:account.description'),
      // Context account feature disabled: auth.context.sh not deployed yet
      // sections: [{ component: <AccountTab /> }],
      sections: [],
    },
    'clis-models': {
      title: t('settings:agents.title'),
      description: t('settings:agents.description'),
      sections: [
        { component: <DefaultAgentSettingsCard /> },
        {
          title: t('settings:agents.reviewPrompt'),
          action: <ReviewPromptResetButton />,
          component: <ReviewPromptSettingsCard />,
        },
        {
          title: t('settings:agents.cliAgents'),
          component: (
            <div className="rounded-xl border border-border/60 bg-muted/10 p-2">
              <CliAgentsList />
            </div>
          ),
        },
      ],
    },
    integrations: {
      title: t('settings:integrations.title'),
      description: t('settings:integrations.description'),
      sections: [{ title: t('settings:integrations.title'), component: <IntegrationsCard /> }],
    },
    repository: {
      title: t('settings:repository.title'),
      description: t('settings:repository.description'),
      sections: [
        { title: t('settings:repository.branchPrefix'), component: <RepositorySettingsCard /> },
      ],
    },
    interface: {
      title: t('settings:interface.title'),
      description: t('settings:interface.description'),
      sections: [
        { component: <ThemeCard /> },
        { component: <TerminalSettingsCard /> },
        { title: t('settings:interface.keyboardShortcuts'), component: <KeyboardSettingsCard /> },
        {
          title: t('settings:interface.tools'),
          component: <HiddenToolsSettingsCard />,
        },
      ],
    },
    marketplaces: {
      title: t('settings:marketplaces.title'),
      description: t('settings:marketplaces.description'),
      sections: [{ component: <MarketplacesCard /> }],
    },
  };

  const currentContent = tabContent[activeTab as keyof typeof tabContent];

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1060px] flex-col gap-6 px-8">
        <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] gap-8 overflow-hidden">
          <div className="py-10">
            <nav className="flex min-h-0 w-52 flex-col gap-0.5 overflow-y-auto">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab && !tab.isExternal;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.isExternal) {
                        handleDocsClick();
                      } else {
                        onTabChange(tab.id);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 hover:bg-background-1 text-foreground-muted hover:text-foreground rounded-md px-3 py-2 text-sm font-normal transition-colors',
                      isActive &&
                        'bg-background-2 text-foreground hover:bg-background-2 hover:text-foreground'
                    )}
                  >
                    <span className="text-left">{tab.label}</span>
                    {tab.isExternal && <ExternalLink className="h-4 w-4" />}
                  </button>
                );
              })}
            </nav>
          </div>
          {/* Content container */}
          {currentContent && (
            <div className="min-h-0 min-w-0 flex-1 justify-center overflow-x-hidden overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl space-y-8 py-10">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl">{currentContent.title}</h2>
                    <p className="text-sm text-foreground-muted">{currentContent.description}</p>
                  </div>
                  <Separator />
                </div>
                {currentContent.sections.map((section) => (
                  <div key={section.title} className="flex flex-col gap-3">
                    {section.title && (
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-normal text-foreground">{section.title}</h3>
                        {section.action && <div>{section.action}</div>}
                      </div>
                    )}
                    {section.component}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

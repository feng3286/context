import { Check, Loader2, Plus } from 'lucide-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import forgejoSvg from '@/assets/images/Forgejo.svg?raw';
import githubSvg from '@/assets/images/Github.svg?raw';
import gitlabSvg from '@/assets/images/GitLab.svg?raw';
import jiraSvg from '@/assets/images/Jira.svg?raw';
import linearSvg from '@/assets/images/Linear.svg?raw';
import plainSvg from '@/assets/images/Plain.svg?raw';
import { useIntegrationsContext } from '@renderer/features/integrations/integrations-provider';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { useGithubContext } from '@renderer/lib/providers/github-context-provider';
import { Button } from '@renderer/lib/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';

/** Light mode: original SVG colors. Dark / dark-black: primary colour. */
const SvgLogo = ({ raw }: { raw: string }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'emdark';

  const processed = isDark
    ? raw
        .replace(/\bfill="[^"]*"/g, 'fill="currentColor"')
        .replace(/\bstroke="[^"]*"/g, 'stroke="currentColor"')
    : raw;

  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center [&_svg]:h-full [&_svg]:w-full [&_svg]:shrink-0 ${isDark ? 'text-primary' : ''}`}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
};

const IntegrationsCard: React.FC = () => {
  const { t } = useTranslation();
  const {
    authenticated,
    isLoading,
    githubLoading,
    handleGithubConnect,
    cancelGithubConnect,
    logout,
    tokenSource,
    checkStatus,
  } = useGithubContext();
  const {
    connectionStatus,
    isLinearConnected,
    isLinearLoading,
    disconnectLinear,
    isJiraConnected,
    isJiraLoading,
    disconnectJira,
    isGitlabConnected,
    isGitlabLoading,
    disconnectGitlab,
    isPlainConnected,
    isPlainLoading,
    disconnectPlain,
    isForgejoConnected,
    isForgejoLoading,
    disconnectForgejo,
  } = useIntegrationsContext();

  const showIntegrationSetup = useShowModal('integrationSetupModal');

  const isCliManaged = authenticated && tokenSource === 'cli';

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const integrations = [
    {
      id: 'github',
      name: 'GitHub',
      description: t('integrations:github.description'),
      logoSvg: githubSvg,
      connected: authenticated,
      loading: isLoading || githubLoading,
      onConnect: handleGithubConnect,
      onCancel: cancelGithubConnect,
      onDisconnect: logout,
      disabledTooltip: isCliManaged ? t('integrations:github.cliManagedTooltip') : undefined,
    },
    {
      id: 'linear',
      name: 'Linear',
      description:
        isLinearConnected && connectionStatus.linear.displayName
          ? connectionStatus.linear.displayName
          : t('integrations:linear.description'),
      logoSvg: linearSvg,
      connected: !!isLinearConnected,
      loading: isLinearLoading,
      onConnect: () => showIntegrationSetup({ integration: 'linear' }),
      onDisconnect: disconnectLinear,
    },
    {
      id: 'jira',
      name: 'Jira',
      description:
        isJiraConnected && connectionStatus.jira.displayName
          ? connectionStatus.jira.displayName
          : t('integrations:jira.description'),
      logoSvg: jiraSvg,
      connected: !!isJiraConnected,
      loading: isJiraLoading,
      onConnect: () => showIntegrationSetup({ integration: 'jira' }),
      onDisconnect: disconnectJira,
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description:
        isGitlabConnected && connectionStatus.gitlab.displayName
          ? connectionStatus.gitlab.displayName
          : t('integrations:gitlab.description'),
      logoSvg: gitlabSvg,
      connected: !!isGitlabConnected,
      loading: isGitlabLoading,
      onConnect: () => showIntegrationSetup({ integration: 'gitlab' }),
      onDisconnect: disconnectGitlab,
    },
    {
      id: 'plain',
      name: 'Plain',
      description: t('integrations:plain.description'),
      logoSvg: plainSvg,
      connected: !!isPlainConnected,
      loading: isPlainLoading,
      onConnect: () => showIntegrationSetup({ integration: 'plain' }),
      onDisconnect: disconnectPlain,
    },
    {
      id: 'forgejo',
      name: 'Forgejo',
      description:
        isForgejoConnected && connectionStatus.forgejo.displayName
          ? connectionStatus.forgejo.displayName
          : t('integrations:forgejo.description'),
      logoSvg: forgejoSvg,
      connected: !!isForgejoConnected,
      loading: isForgejoLoading,
      onConnect: () => showIntegrationSetup({ integration: 'forgejo' }),
      onDisconnect: disconnectForgejo,
    },
  ];

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
    >
      {integrations.map((integration) => (
        <div key={integration.id} className="flex h-full min-h-0">
          <div className="flex w-full items-center gap-4 rounded-lg border border-muted bg-muted/20 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
              <SvgLogo raw={integration.logoSvg} />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <h3 className="text-sm font-medium text-foreground">{integration.name}</h3>
              <p className="text-sm text-muted-foreground">{integration.description}</p>
            </div>
            {integration.connected ? (
              integration.disabledTooltip ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      className="inline-flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-md border border-input bg-background opacity-70"
                      aria-label={integration.disabledTooltip}
                    >
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{integration.disabledTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={integration.onDisconnect}
                  aria-label={t('integrations:actions.disconnect', { name: integration.name })}
                >
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </Button>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={
                  integration.loading && integration.onCancel
                    ? integration.onCancel
                    : integration.onConnect
                }
                aria-label={
                  integration.loading
                    ? t('integrations:actions.cancelConnecting', { name: integration.name })
                    : t('integrations:actions.connect', { name: integration.name })
                }
              >
                {integration.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default IntegrationsCard;

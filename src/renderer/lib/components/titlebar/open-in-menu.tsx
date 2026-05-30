import { useHotkey } from '@tanstack/react-hotkeys';
import { ChevronDown } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { getAppById, isValidOpenInAppId, type OpenInAppId } from '@shared/openInApps';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { useToast } from '@renderer/lib/hooks/use-toast';
import {
  getEffectiveHotkey,
  getHotkeyRegistration,
} from '@renderer/lib/hooks/useKeyboardShortcuts';
import { useOpenInApps } from '@renderer/lib/hooks/useOpenInApps';
import { rpc } from '@renderer/lib/ipc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';

export interface OpenInProjectOption {
  projectId: string;
  projectName: string;
  worktreePath: string;
}

interface OpenInMenuProps {
  path: string;
  filePath?: string;
  lineNumber?: number;
  isRemote?: boolean;
  sshConnectionId?: string | null;
  className?: string;
  /** For multi-project tasks, optional projectId to determine the correct worktree path */
  projectId?: string;
  /** Project options for multi-project tasks. When length > 1, a project selector is shown */
  projectOptions?: OpenInProjectOption[];
}

export const OpenInMenu: React.FC<OpenInMenuProps> = ({
  path,
  filePath,
  lineNumber,
  className,
  isRemote = false,
  sshConnectionId = null,
  projectId,
  projectOptions,
}) => {
  const { toast } = useToast();
  const { icons, labels, installedApps, availability, loading } = useOpenInApps();
  const { value: openIn, update } = useAppSettingsKey('openIn');
  const { value: keyboard } = useAppSettingsKey('keyboard');
  const openInHotkey = getEffectiveHotkey('openInEditor', keyboard);

  const showProjectSelector = projectOptions && projectOptions.length > 1;

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);

  const effectiveProjectId = useMemo(() => {
    if (selectedProjectId) return selectedProjectId;
    return projectId;
  }, [selectedProjectId, projectId]);

  const effectivePath = useMemo(() => {
    if (!selectedProjectId) return path;
    const option = projectOptions?.find((p) => p.projectId === selectedProjectId);
    return option?.worktreePath ?? path;
  }, [selectedProjectId, projectOptions, path]);

  const defaultApp: OpenInAppId | null =
    openIn?.default && isValidOpenInAppId(openIn.default) ? openIn.default : null;

  const persistPreferredApp = useCallback(
    (appId: OpenInAppId) => {
      update({ default: appId });
    },
    [update]
  );

  const triggerOpenIn = useCallback(
    async (appId: OpenInAppId) => {
      const label = labels[appId] || appId;
      try {
        const res = await rpc.app.openIn({
          app: appId,
          path: effectivePath,
          filePath,
          lineNumber,
          isRemote,
          sshConnectionId: sshConnectionId ?? undefined,
          projectId: effectiveProjectId,
        });
        if (!res?.success) {
          toast({
            title: `Open in ${label} failed`,
            description: res?.error || 'Application not available.',
            variant: 'destructive',
          });
        }
      } catch (e: unknown) {
        toast({
          title: `Open in ${label} failed`,
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      }
    },
    [
      labels,
      effectivePath,
      filePath,
      lineNumber,
      isRemote,
      sshConnectionId,
      effectiveProjectId,
      toast,
    ]
  );

  const sortedApps = useMemo(() => {
    if (!defaultApp) return installedApps;
    return [...installedApps].sort((a, b) => {
      if (a.id === defaultApp) return -1;
      if (b.id === defaultApp) return 1;
      return 0;
    });
  }, [defaultApp, installedApps]);

  const menuApps = useMemo(
    () => sortedApps.filter((app) => !app.hideIfUnavailable || availability[app.id]),
    [availability, sortedApps]
  );

  const buttonAppId = useMemo(() => {
    if (defaultApp && menuApps.some((app) => app.id === defaultApp)) {
      return defaultApp;
    }
    return menuApps[0]?.id;
  }, [defaultApp, menuApps]);

  const buttonAppLabel = buttonAppId ? (labels[buttonAppId] ?? buttonAppId) : null;

  useHotkey(
    getHotkeyRegistration('openInEditor', keyboard),
    () => {
      if (!buttonAppId) return;
      void triggerOpenIn(buttonAppId);
    },
    { enabled: !!buttonAppId && !loading && openInHotkey !== null }
  );

  const displayProjectName = useMemo(() => {
    if (!effectiveProjectId || !projectOptions) return '';
    const option = projectOptions.find((p) => p.projectId === effectiveProjectId);
    return option?.projectName ?? '';
  }, [effectiveProjectId, projectOptions]);

  return (
    <div
      className={cn(
        'group border border-border rounded-md h-6 flex items-center text-foreground-muted overflow-hidden cursor-pointer',
        className
      )}
    >
      <TooltipProvider delay={0}>
        {showProjectSelector && (
          <Select
            value={effectiveProjectId ?? ''}
            onValueChange={(value) => {
              setSelectedProjectId(value || undefined);
            }}
          >
            <SelectTrigger
              showChevron={false}
              className="group shrink-0 h-6 min-w-16 max-w-32 rounded-r-none bg-transparent flex items-center justify-center px-1.5 text-xs truncate transition-colors hover:bg-background-1 hover:text-foreground cursor-pointer"
              aria-label="Select project"
            >
              {displayProjectName ? (
                <span className="truncate">{displayProjectName}</span>
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} sideOffset={6}>
              {projectOptions.map((option) => (
                <SelectItem key={option.projectId} value={option.projectId}>
                  {option.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Tooltip>
          <TooltipTrigger className="flex-1 flex min-w-0 cursor-pointer">
            <button
              type="button"
              className={cn(
                'group flex items-center w-full min-w-0 gap-1.5 border-r border-border truncate rounded-r-none px-2 text-xs transition-colors hover:bg-background-1 hover:text-foreground',
                showProjectSelector && 'border-l border-border rounded-l-none'
              )}
              onClick={() => {
                if (!buttonAppId) return;
                void triggerOpenIn(buttonAppId);
              }}
              disabled={!buttonAppId || loading}
              aria-label={buttonAppLabel ? `Open in ${buttonAppLabel}` : 'Open'}
            >
              {buttonAppId && icons[buttonAppId] && (
                <img
                  src={icons[buttonAppId]}
                  alt={labels[buttonAppId] || buttonAppId}
                  className={`size-3.5 rounded ${
                    getAppById(buttonAppId)?.invertInDark ? 'dark:invert' : ''
                  }`}
                />
              )}
              <span>{buttonAppLabel || 'Open'}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex flex-col gap-1">
              <span>Open in {buttonAppLabel || 'editor'}</span>
              <ShortcutHint settingsKey="openInEditor" />
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Select
        value={defaultApp ?? undefined}
        onValueChange={(value) => {
          if (isValidOpenInAppId(value)) {
            persistPreferredApp(value as OpenInAppId);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <SelectTrigger
                showChevron={false}
                className="group shrink-0 size-6 border-none bg-transparent flex items-center justify-center transition-colors hover:bg-background-1 hover:text-foreground cursor-pointer"
                aria-label="Open in options"
              >
                <ChevronDown className="size-3.5" />
              </SelectTrigger>
            }
          ></TooltipTrigger>
          <TooltipContent side="bottom">Select open in app</TooltipContent>
        </Tooltip>
        <SelectContent align="end" alignItemWithTrigger={false} sideOffset={6}>
          {menuApps.map((app) => {
            const isAvailable = loading ? availability[app.id] === true : true;
            return (
              <SelectItem key={app.id} value={app.id} disabled={!isAvailable}>
                {icons[app.id] && (
                  <img
                    src={icons[app.id]}
                    alt={labels[app.id] || app.label}
                    className={`h-4 w-4 rounded ${app.invertInDark ? 'dark:invert' : ''}`}
                  />
                )}
                {labels[app.id] || app.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

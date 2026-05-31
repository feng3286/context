import { app, Menu, nativeTheme, shell } from 'electron';
import {
  menuCheckForUpdatesChannel,
  menuCloseTabChannel,
  menuOpenSettingsChannel,
  menuRedoChannel,
  menuUndoChannel,
} from '@shared/events/appEvents';
import { EMDASH_DOCS_URL, EMDASH_RELEASES_URL } from '@shared/urls';
import { events } from '@main/lib/events';
import { getMenuT as t } from '@main/lib/i18n/menu';

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: t('app', { name: app.name }),
                click: () => app.showAboutPanel(),
              },
              { type: 'separator' as const },
              {
                label: t('settings'),
                accelerator: 'CmdOrCtrl+,',
                click: () => events.emit(menuOpenSettingsChannel, undefined),
              },
              {
                label: t('checkForUpdates'),
                click: () => events.emit(menuCheckForUpdatesChannel, undefined),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              {
                label: t('quit', { name: app.name }),
                accelerator: 'CmdOrCtrl+Q',
                click: () => app.quit(),
              },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),
    // File menu
    {
      label: t('file'),
      submenu: [
        // On non-macOS, put Settings in File menu
        ...(!isMac
          ? [
              {
                label: t('settings'),
                accelerator: 'CmdOrCtrl+,',
                click: () => events.emit(menuOpenSettingsChannel, undefined),
              },
              { type: 'separator' as const },
            ]
          : []),
        isMac
          ? {
              label: t('closeTab'),
              accelerator: 'CmdOrCtrl+W',
              click: () => events.emit(menuCloseTabChannel, undefined),
            }
          : { role: 'quit' as const },
      ],
    },
    // Edit menu
    {
      label: t('edit'),
      submenu: [
        {
          label: t('undo'),
          accelerator: 'CmdOrCtrl+Z',
          click: () => events.emit(menuUndoChannel, undefined),
        },
        {
          label: t('redo'),
          accelerator: isMac ? 'Shift+CmdOrCtrl+Z' : 'CmdOrCtrl+Y',
          click: () => events.emit(menuRedoChannel, undefined),
        },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' as const }] : []),
        { role: 'delete' as const },
        { role: 'selectAll' as const },
      ],
    },
    // View menu
    {
      label: t('view'),
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    // Window menu
    {
      role: 'windowMenu' as const,
      label: t('window'),
      submenu: [
        { role: 'minimize' as const, label: t('minimize') },
        { role: 'zoom' as const, label: t('zoom') },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const, label: t('bringAllToFront') },
              { type: 'separator' as const },
              { role: 'close' as const },
            ]
          : []),
      ],
    },
    // Help menu
    {
      label: t('help'),
      submenu: [
        {
          label: t('docs'),
          click: () => shell.openExternal(EMDASH_DOCS_URL),
        },
        {
          label: t('changelog'),
          click: () => shell.openExternal(EMDASH_RELEASES_URL),
        },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: t('checkForUpdates'),
                click: () => events.emit(menuCheckForUpdatesChannel, undefined),
              },
            ]
          : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

export function updateApplicationMenu(): void {
  setupApplicationMenu();
}

// Apply nativeTheme based on app settings
export async function applyNativeTheme(): Promise<void> {
  try {
    const theme = await import('@main/core/settings/settings-service')
      .then((m) => m.appSettingsService)
      .then((s) => s.get('theme'));
    if (theme === 'emlight') {
      nativeTheme.themeSource = 'light';
    } else if (theme === 'emdark') {
      nativeTheme.themeSource = 'dark';
    } else {
      nativeTheme.themeSource = 'system';
    }
  } catch {
    // settings not available yet, skip
  }
}

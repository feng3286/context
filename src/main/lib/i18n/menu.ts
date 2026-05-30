import { appSettingsService } from '@main/core/settings/settings-service';
import type { SupportedLanguage } from '@renderer/i18n/config';

const menuTranslations: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    app: 'About {{name}}',
    settings: 'Settings…',
    checkForUpdates: 'Check for Updates…',
    quit: 'Quit {{name}}',
    file: 'File',
    closeTab: 'Close Tab',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    view: 'View',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    separator: 'separator',
    bringAllToFront: 'Bring All to Front',
    help: 'Help',
    docs: 'Docs',
    changelog: 'Changelog',
  },
  zh: {
    app: '关于 {{name}}',
    settings: '设置…',
    checkForUpdates: '检查更新…',
    quit: '退出 {{name}}',
    file: '文件',
    closeTab: '关闭标签页',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    view: '视图',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    separator: 'separator',
    bringAllToFront: '前置全部窗口',
    help: '帮助',
    docs: '文档',
    changelog: '更新日志',
  },
};

let currentLanguage: SupportedLanguage = 'zh';

export function getMenuT(key: string, params?: Record<string, string>): string {
  const dict = menuTranslations[currentLanguage];
  const value = dict[key] ?? key;
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
}

export async function loadMenuLanguage(): Promise<void> {
  try {
    const lang = await appSettingsService.get('language');
    currentLanguage = lang as SupportedLanguage;
  } catch {
    currentLanguage = 'zh';
  }
}

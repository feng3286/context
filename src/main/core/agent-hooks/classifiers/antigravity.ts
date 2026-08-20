import { createProviderClassifier, type ClassificationResult } from './base';

/**
 * Antigravity CLI (agy) — successor to Gemini CLI. Shares the same TUI
 * lineage, so permission and idle markers match the gemini classifier.
 */
export function createAntigravityClassifier() {
  return createProviderClassifier((text: string): ClassificationResult => {
    const tail = text.slice(-500);

    if (/Action Required/i.test(tail)) {
      return {
        type: 'notification',
        notificationType: 'permission_prompt',
      };
    }

    if (/\[INSERT\]|\[NORMAL\]/.test(tail)) {
      return {
        type: 'notification',
        notificationType: 'idle_prompt',
      };
    }

    return undefined;
  });
}

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rpc } from '@renderer/lib/ipc';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@renderer/lib/ui/context-menu';

/**
 * Context menu that offers "copy absolute path" / "copy relative path" for a
 * file row. Shared by the editor file trees and the diff-view changes list so
 * the clipboard + "Copied" feedback logic lives in one place.
 *
 * `absolutePath` / `relativePath` are the full strings to copy.
 */
export function CopyPathContextMenu({
  absolutePath,
  relativePath,
}: {
  absolutePath: string;
  relativePath: string;
}) {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // clipboard may not be available (e.g., in dev without HTTPS)
    }
  }, []);

  const label = (field: string, defaultLabel: string) =>
    copiedField === field ? t('editor:fileTree.copied') : defaultLabel;

  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => handleCopy(absolutePath, 'absolute')}>
        {label('absolute', t('editor:fileTree.copyAbsolutePath'))}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCopy(relativePath, 'relative')}>
        {label('relative', t('editor:fileTree.copyRelativePath'))}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => rpc.app.showItemInFolder(absolutePath)}>
        {t('editor:fileTree.openInFileManager')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

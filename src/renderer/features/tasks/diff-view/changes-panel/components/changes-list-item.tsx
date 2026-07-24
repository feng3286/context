import { SquareArrowRight, SquareDot, SquareMinus, SquarePlus, SquareX } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef, useMemo } from 'react';
import { GitChange, GitChangeStatus } from '@shared/git';
import { CopyPathContextMenu } from '@renderer/features/tasks/components/copy-path-menu';
import { splitPath } from '@renderer/features/tasks/utils';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { ContextMenu, ContextMenuTrigger } from '@renderer/lib/ui/context-menu';
import { cn } from '@renderer/utils/utils';

interface ChangesListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  change: GitChange;
  isSelected?: boolean;
  isActive?: boolean;
  onToggleSelect?: (path: string) => void;
  /** When provided, enables a right-click menu to copy the file's absolute/relative path. */
  worktreePath?: string;
}

export const ChangesListItem = forwardRef<HTMLButtonElement, ChangesListItemProps>(
  ({ change, isSelected, isActive, onToggleSelect, worktreePath, className, ...props }, ref) => {
    const { filename, directory } = useMemo(() => splitPath(change.path), [change.path]);
    return (
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              className={cn(
                'group/item w-full flex items-center gap-2 justify-between px-2 py-1 hover:bg-background-1 h-7 rounded-md',
                isActive && 'bg-background-2 hover:bg-background-2',
                className
              )}
              ref={ref}
              {...props}
            />
          }
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FileIcon filename={filename} size={12} />
            <span className="text-sm truncate">{filename}</span>
            {directory && (
              <span className="text-xs text-foreground-muted truncate">{directory}</span>
            )}
          </div>
          <div className="relative size-4 shrink-0 flex items-center justify-center">
            <span
              className={cn(
                'transition-opacity',
                onToggleSelect && 'group-hover/item:opacity-0',
                isSelected && 'opacity-0'
              )}
            >
              <GitChangeStatusIcon status={change.status} className="size-4" />
            </span>
            {onToggleSelect && (
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center transition-opacity',
                  'opacity-0 group-hover/item:opacity-100',
                  isSelected && 'opacity-100'
                )}
              >
                <Checkbox
                  checked={isSelected ?? false}
                  onCheckedChange={() => onToggleSelect(change.path)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${filename}`}
                />
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        {worktreePath && (
          <CopyPathContextMenu
            absolutePath={`${worktreePath}/${change.path}`}
            relativePath={change.path}
          />
        )}
      </ContextMenu>
    );
  }
);

function GitChangeStatusIcon({
  status,
  className,
}: {
  status: GitChangeStatus;
  className?: string;
}) {
  switch (status) {
    case 'added':
      return <SquarePlus className={cn('size-4 text-foreground-diff-added', className)} />;
    case 'modified':
      return <SquareDot className={cn('size-4 text-foreground-diff-modified', className)} />;
    case 'deleted':
      return <SquareMinus className={cn('size-4 text-foreground-diff-deleted', className)} />;
    case 'renamed':
      return <SquareArrowRight className={cn('size-4 text-gray-500', className)} />;
    case 'conflicted':
      return <SquareX className={cn('size-4 text-orange-500', className)} />;
    default:
      return null;
  }
}

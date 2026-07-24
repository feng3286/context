import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileNode } from '@shared/fs';
import { CopyPathContextMenu } from '@renderer/features/tasks/components/copy-path-menu';
import { buildVisibleRows } from '@renderer/features/tasks/editor/stores/files-store-utils';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { Button } from '@renderer/lib/ui/button';
import { ContextMenu, ContextMenuTrigger } from '@renderer/lib/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { UnifiedMultiProjectFileTree } from './unified-multi-project-file-tree';

const FileTreeRow = observer(function FileTreeRow({
  node,
  style,
  projectId,
}: {
  node: FileNode;
  style: React.CSSProperties;
  projectId: string;
}) {
  const taskState = useProvisionedTask();
  const { taskView } = taskState;
  const editorView = taskView.editorView;

  const isExpanded = editorView.expandedPaths.has(node.path);
  const isSelected = taskView.view === 'editor' && editorView.activeFilePath === node.path;
  const fileStatus = taskState.workspace.git.fileChanges?.find((c) => c.path === node.path)?.status;
  const paddingLeft = node.depth * 12 + 4;

  // Compute paths for context menu
  const worktreePath = taskState.path ?? '';
  const absolutePath = worktreePath ? `${worktreePath}/${node.path}` : node.path;
  const relativePath = node.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (taskView.view !== 'editor') {
      taskView.setView('editor');
    }
    if (node.type === 'directory') {
      toggleExpand();
    } else {
      editorView.openFilePreview(node.path, projectId);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'file') {
      editorView.openFile(node.path, projectId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (node.type === 'directory') {
        toggleExpand();
      } else {
        editorView.openFilePreview(node.path, projectId);
      }
    }
  };

  const toggleExpand = () => {
    if (editorView.expandedPaths.has(node.path)) {
      editorView.expandedPaths.delete(node.path);
    } else {
      editorView.expandedPaths.add(node.path);
      if (!taskState.workspace.files.loadedPaths.has(node.path)) {
        void taskState.workspace.files.loadDir(node.path);
      }
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          style={{ ...style, paddingLeft }}
          className={cn(
            'flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 hover:bg-background-1',
            isSelected && 'bg-background-2 hover:bg-background-2',
            node.isHidden && 'opacity-60'
          )}
          tabIndex={0}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={node.type === 'directory' ? isExpanded : undefined}
        >
          <span className="shrink-0 text-muted-foreground">
            {node.type === 'directory' ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="inline-block w-3.5" />
            )}
          </span>

          <span className="shrink-0">
            {node.type === 'directory' ? (
              isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              )
            ) : (
              <FileIcon filename={node.name} size={12} />
            )}
          </span>

          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              fileStatus === 'added' && 'text-green-500',
              fileStatus === 'modified' && 'text-amber-500',
              fileStatus === 'deleted' && 'text-red-500 line-through',
              fileStatus === 'renamed' && 'text-blue-500'
            )}
          >
            {node.name}
          </span>
        </div>
      </ContextMenuTrigger>
      <CopyPathContextMenu absolutePath={absolutePath} relativePath={relativePath} />
    </ContextMenu>
  );
});

export const EditorFileTree = observer(function EditorFileTree() {
  const taskState = useProvisionedTask();
  const { t } = useTranslation();
  const [isReloading, setIsReloading] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  // 废弃：isMultiProject 恒为 true → files 恒为 null；单项目 workspace.files 分支不可达
  const files = taskState.isMultiProject ? null : taskState.workspace.files;
  const editorView = taskState.taskView.editorView;
  const projectId = taskState._projectId;

  const handleRefresh = useCallback(async () => {
    if (isReloading || !files) return;
    setIsReloading(true);
    try {
      await files.reload();
    } finally {
      setIsReloading(false);
    }
  }, [files, isReloading]);

  const visibleRows = files
    ? buildVisibleRows(files.nodes, files.childIndex, editorView.expandedPaths)
    : [];

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  // 多项目任务使用统一的文件树（isMultiProject 已废弃恒为 true，此条件实际只靠 projectContexts 门控加载）
  if (taskState.isMultiProject && taskState.projectContexts) {
    return <UnifiedMultiProjectFileTree />;
  }

  // 废弃：以下单项目渲染路径不可达——isMultiProject 恒 true 时只在 projectContexts 加载期间落到这里，
  // 且 files=null→visibleRows=[]→只显示 "No files"，单项目 FileTreeRow 永不挂载。
  if (files?.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (files?.error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        {files.error}
      </div>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No files
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-end border-b border-border px-2 py-1">
        <TooltipProvider delay={150}>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="sm"
                disabled={isReloading}
                onClick={handleRefresh}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                aria-label={t('editor:fileTree.refresh')}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isReloading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('editor:fileTree.refresh')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {/* File tree */}
      <div ref={parentRef} className="flex-1 overflow-y-auto px-1 py-1" role="tree">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const node = visibleRows[vItem.index] as FileNode;
            return (
              <FileTreeRow
                key={node.path}
                node={node}
                projectId={projectId}
                style={{
                  position: 'absolute',
                  top: vItem.start,
                  left: 0,
                  width: '100%',
                  height: `${vItem.size}px`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

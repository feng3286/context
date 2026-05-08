import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useRef } from 'react';
import type { FileNode } from '@shared/fs';
import { buildVisibleRows } from '@renderer/features/tasks/editor/stores/files-store-utils';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { cn } from '@renderer/utils/utils';

/**
 * Per-project file tree row component
 */
const ProjectFileTreeRow = observer(function ProjectFileTreeRow({
  node,
  style,
  projectId,
}: {
  node: FileNode;
  style: React.CSSProperties;
  projectId: string;
}) {
  const taskState = useProvisionedTask();
  const projectContext = taskState.projectContexts?.projects.get(projectId);
  const editorView = taskState.taskView.editorView;

  if (!projectContext) return null;

  const isExpanded = editorView.expandedPaths.has(node.path);
  const isSelected =
    taskState.taskView.view === 'editor' && editorView.activeFilePath === node.path;
  const fileStatus = projectContext.git.fileChanges?.find((c) => c.path === node.path)?.status;
  const paddingLeft = node.depth * 12 + 4;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (taskState.taskView.view !== 'editor') {
      taskState.taskView.setView('editor');
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
      if (!projectContext.files.loadedPaths.has(node.path)) {
        void projectContext.files.loadDir(node.path);
      }
    }
  };

  return (
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
  );
});

/**
 * Single project section in multi-project file tree
 */
const ProjectFileTreeSection = observer(function ProjectFileTreeSection({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const taskState = useProvisionedTask();
  const projectContexts = taskState.projectContexts;
  const projectContext = projectContexts?.projects.get(projectId);
  const editorView = taskState.taskView.editorView;

  if (!projectContext || !projectContexts) return null;

  const expanded = projectContexts.isExpanded(projectId);
  const files = projectContext.files;

  const visibleRows = files?.tree.data
    ? buildVisibleRows(files.nodes, files.childIndex, editorView.expandedPaths)
    : [];

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  return (
    <div className="flex flex-col border-b border-border last:border-b-0">
      {/* Project header */}
      <div
        className="flex h-7 cursor-pointer select-none items-center gap-1.5 px-2 hover:bg-background-1"
        onClick={() => projectContexts.toggleSection(projectId)}
        role="treeitem"
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="shrink-0">
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{projectName}</span>
      </div>

      {/* Project file tree content */}
      {expanded && (
        <div className="flex-1 overflow-hidden">
          {files.isLoading ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              Loading...
            </div>
          ) : files.error ? (
            <div className="flex items-center justify-center py-4 text-xs text-destructive">
              {files.error}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              No files
            </div>
          ) : (
            <div
              ref={parentRef}
              className="h-auto max-h-[300px] overflow-y-auto px-1 py-1"
              role="tree"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const node = visibleRows[vItem.index] as FileNode;
                  return (
                    <ProjectFileTreeRow
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
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Multi-project file tree wrapper.
 * Shows project sections with their own file trees.
 */
export const MultiProjectFileTree = observer(function MultiProjectFileTree() {
  const taskState = useProvisionedTask();
  const projectContexts = taskState.projectContexts;

  if (!projectContexts) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading project contexts...
      </div>
    );
  }

  if (projectContexts.projects.size === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No projects found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {Array.from(projectContexts.projects.values()).map((projectContext) => (
        <ProjectFileTreeSection
          key={projectContext.projectId}
          projectId={projectContext.projectId}
          projectName={projectContext.projectName}
        />
      ))}
    </div>
  );
});

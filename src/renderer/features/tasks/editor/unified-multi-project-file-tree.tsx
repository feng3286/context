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
 * Virtual file node representing a project header in the unified tree
 */
interface ProjectHeaderNode {
  path: string;
  name: string;
  parentPath: string | null;
  depth: number;
  type: 'project-header';
  isHidden: boolean;
  projectId: string;
}

type UnifiedNode = FileNode | ProjectHeaderNode;

/**
 * Build a unified tree structure from multiple projects
 */
function buildUnifiedTree(
  projectContexts: NonNullable<ReturnType<typeof useProvisionedTask>['projectContexts']>,
  expandedPaths: Set<string>,
  expandedProjects: Set<string>
): UnifiedNode[] {
  const rows: UnifiedNode[] = [];

  for (const projectContext of Array.from(projectContexts.projects.values())) {
    const projectId = projectContext.projectId;
    const projectName = projectContext.projectName;
    const projectKey = `project:${projectId}`;

    // Create a synthetic project header node
    const headerNode: ProjectHeaderNode = {
      path: projectKey,
      name: projectName,
      parentPath: null,
      type: 'project-header',
      depth: 0,
      projectId,
      isHidden: false,
    };
    rows.push(headerNode);

    // If project is expanded, add its file tree
    if (expandedProjects.has(projectKey)) {
      const fileRows = buildVisibleRows(
        projectContext.files.nodes,
        projectContext.files.childIndex,
        expandedPaths
      );
      // Increase depth for all file nodes to show them nested under project
      for (const node of fileRows) {
        rows.push({ ...node, depth: node.depth + 1 });
      }
    }
  }

  return rows;
}

/**
 * Unified file tree row component
 */
const UnifiedFileTreeRow = observer(function UnifiedFileTreeRow({
  node,
  style,
}: {
  node: UnifiedNode;
  style: React.CSSProperties;
}) {
  const taskState = useProvisionedTask();
  const editorView = taskState.taskView.editorView;

  const isProjectHeader = node.type === 'project-header';
  const projectId = isProjectHeader
    ? node.projectId
    : taskState.projectContexts?.findProjectIdForPath?.(node.path);
  const projectContext = projectId ? taskState.projectContexts?.projects.get(projectId) : null;

  if (!projectContext && !isProjectHeader) return null;

  // For project headers, check expandedProjects; for directories, check expandedPaths
  const expandedProjects = taskState.projectContexts?.expandedProjects ?? new Set();
  const isExpanded = isProjectHeader
    ? expandedProjects.has(node.path)
    : node.type === 'directory' && editorView.expandedPaths.has(node.path);

  const isSelected =
    !isProjectHeader &&
    taskState.taskView.view === 'editor' &&
    editorView.activeFilePath === node.path;

  const fileStatus =
    !isProjectHeader && projectContext
      ? projectContext.git.fileChanges?.find((c) => c.path === node.path)?.status
      : undefined;

  const paddingLeft = node.depth * 12 + 4;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (taskState.taskView.view !== 'editor') {
      taskState.taskView.setView('editor');
    }
    if (isProjectHeader) {
      toggleProjectExpand();
    } else if (node.type === 'directory') {
      toggleExpand();
    } else {
      editorView.openFilePreview(node.path, projectId!);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isProjectHeader && node.type === 'file') {
      editorView.openFile(node.path, projectId!);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isProjectHeader) {
        toggleProjectExpand();
      } else if (node.type === 'directory') {
        toggleExpand();
      } else {
        editorView.openFilePreview(node.path, projectId!);
      }
    }
  };

  const toggleProjectExpand = () => {
    if (!taskState.projectContexts) return;
    taskState.projectContexts.toggleProjectExpand(node.path);
  };

  const toggleExpand = () => {
    if (editorView.expandedPaths.has(node.path)) {
      editorView.expandedPaths.delete(node.path);
    } else {
      editorView.expandedPaths.add(node.path);
      if (projectContext && !projectContext.files.loadedPaths.has(node.path)) {
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
        node.isHidden && 'opacity-60',
        isProjectHeader && 'font-medium'
      )}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isProjectHeader || node.type === 'directory' ? isExpanded : undefined}
    >
      <span className="shrink-0 text-muted-foreground">
        {isProjectHeader || node.type === 'directory' ? (
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
        {isProjectHeader ? (
          isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          )
        ) : node.type === 'directory' ? (
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
 * Unified multi-project file tree.
 * Shows all projects in a single tree structure with projects as top-level folders.
 */
export const UnifiedMultiProjectFileTree = observer(function UnifiedMultiProjectFileTree() {
  const taskState = useProvisionedTask();
  const projectContexts = taskState.projectContexts;
  const editorView = taskState.taskView.editorView;
  const expandedProjects = projectContexts?.expandedProjects ?? new Set();

  // Compute visible rows inline - MobX observer will track all observable accesses
  // and re-render when files.nodes/childIndex change after loading
  const visibleRows = projectContexts
    ? buildUnifiedTree(projectContexts, editorView.expandedPaths, expandedProjects)
    : [];

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

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
    <div ref={parentRef} className="flex h-full flex-col overflow-y-auto px-1 py-1" role="tree">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const node = visibleRows[vItem.index]!;
          return (
            <UnifiedFileTreeRow
              key={node.path}
              node={node}
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
  );
});

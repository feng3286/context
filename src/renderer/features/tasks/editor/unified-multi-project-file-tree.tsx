import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef, useState } from 'react';
import type { FileNode } from '@shared/fs';
import { buildVisibleRows } from '@renderer/features/tasks/editor/stores/files-store-utils';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { rpc } from '@renderer/lib/ipc';
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

/**
 * File node with attached projectId for the unified tree
 */
interface ProjectFileNode extends FileNode {
  projectId: string;
}

/**
 * Task-root file node for multi-project tasks
 */
interface TaskRootFileNode {
  path: string;
  name: string;
  parentPath: string | null;
  depth: number;
  type: 'task-root-file' | 'task-root-dir';
  isHidden: boolean;
  projectId: '__task_root__';
}

type UnifiedNode = ProjectHeaderNode | ProjectFileNode | TaskRootFileNode;

interface TaskRootFileEntry {
  name: string;
  type: 'dir' | 'file';
}

/**
 * Build a unified tree structure from multiple projects with task-root files
 */
function buildUnifiedTree(
  projectContexts: NonNullable<ReturnType<typeof useProvisionedTask>['projectContexts']>,
  expandedPaths: Set<string>,
  expandedProjects: Set<string>,
  taskRootFiles: TaskRootFileEntry[]
): UnifiedNode[] {
  const rows: UnifiedNode[] = [];

  // Add project sections first
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

    // If project is expanded, add its file tree with projectId attached
    if (expandedProjects.has(projectKey)) {
      const fileRows = buildVisibleRows(
        projectContext.files.nodes,
        projectContext.files.childIndex,
        expandedPaths
      );
      // Increase depth for all file nodes and attach projectId
      for (const node of fileRows) {
        rows.push({ ...node, depth: node.depth + 1, projectId });
      }
    }
  }

  // Add task-root files at the bottom
  if (taskRootFiles.length > 0) {
    for (const entry of taskRootFiles) {
      rows.push({
        path: `task-root:${entry.name}`,
        name: entry.name,
        parentPath: null,
        depth: 0,
        type: entry.type === 'dir' ? 'task-root-dir' : 'task-root-file',
        isHidden: false,
        projectId: '__task_root__',
      });
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
  const isTaskRoot = node.projectId === '__task_root__';
  const projectId = isTaskRoot ? undefined : node.projectId;
  const projectContext = projectId
    ? taskState.projectContexts?.projects.get(projectId)
    : null;

  if (!projectContext && !isProjectHeader && !isTaskRoot) return null;

  // For project headers, check expandedProjects; for directories, check expandedPaths
  const expandedProjects = taskState.projectContexts?.expandedProjects ?? new Set();
  const isExpanded = isProjectHeader
    ? expandedProjects.has(node.path)
    : node.type === 'directory' && editorView.expandedPaths.has(node.path);

  const isSelected =
    !isProjectHeader &&
    !isTaskRoot &&
    taskState.taskView.view === 'editor' &&
    editorView.activeFilePath === node.path;

  const fileStatus =
    !isProjectHeader && !isTaskRoot && projectContext
      ? projectContext.git.fileChanges?.find((c) => c.path === node.path)?.status
      : undefined;

  const paddingLeft = node.depth * 12 + 4;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (taskState.taskView.view !== 'editor') {
      taskState.taskView.setView('editor');
    }
    if (isProjectHeader) {
      taskState.projectContexts?.toggleProjectExpand(node.path);
    } else if (node.type === 'directory') {
      if (editorView.expandedPaths.has(node.path)) {
        editorView.expandedPaths.delete(node.path);
      } else {
        editorView.expandedPaths.add(node.path);
        if (projectContext && !projectContext.files.loadedPaths.has(node.path)) {
          void projectContext.files.loadDir(node.path);
        }
      }
    } else if (node.type === 'task-root-file') {
      editorView.openFile(node.path, '__task_root__');
    } else if (node.type === 'file' && projectId) {
      editorView.openFile(node.path, projectId);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'task-root-file') {
      editorView.openFile(node.path, '__task_root__');
    } else if (node.type === 'file' && projectId) {
      editorView.openFile(node.path, projectId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as unknown as React.MouseEvent);
    }
  };

  return (
    <div
      style={{ ...style, paddingLeft }}
      className={cn(
        'flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 hover:bg-background-1',
        isSelected && 'bg-background-2 hover:bg-background-2',
        node.isHidden && 'opacity-60',
        isProjectHeader && 'font-medium',
        isTaskRoot && node.type === 'task-root-file' && 'italic'
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
        ) : isTaskRoot ? (
          node.type === 'task-root-dir' ? (
            <Folder className="h-3.5 w-3.5 text-muted-foreground/60" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
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
          fileStatus === 'renamed' && 'text-blue-500',
          isTaskRoot && 'text-muted-foreground/80'
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
 * Also shows task-root files (e.g. AGENTS.md) above project directories.
 */
export const UnifiedMultiProjectFileTree = observer(function UnifiedMultiProjectFileTree() {
  const taskState = useProvisionedTask();
  const projectContexts = taskState.projectContexts;
  const editorView = taskState.taskView.editorView;
  const expandedProjects = projectContexts?.expandedProjects ?? new Set();
  const [taskRootFiles, setTaskRootFiles] = useState<TaskRootFileEntry[]>([]);

  // Load task-root files for multi-project tasks
  useEffect(() => {
    if (!projectContexts || projectContexts.projects.size <= 1) {
      setTaskRootFiles([]);
      return;
    }
    const taskId = taskState.workspaceId;
    rpc.fs
      .listTaskRootFiles(taskId)
      .then((result) => {
        if (result.success) {
          setTaskRootFiles(
            result.data.files.map((f) => ({
              name: f.name,
              type: f.type as 'dir' | 'file',
            }))
          );
        }
      })
      .catch(() => {});
  }, [projectContexts, taskState.workspaceId]);

  // Compute visible rows inline - MobX observer will track all observable accesses
  const visibleRows = projectContexts
    ? buildUnifiedTree(
        projectContexts,
        editorView.expandedPaths,
        expandedProjects,
        taskRootFiles
      )
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
          // Use projectId + path as key to avoid conflicts between projects with same file paths
          const key = `${node.projectId}:${node.path}`;
          return (
            <UnifiedFileTreeRow
              key={key}
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

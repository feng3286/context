-- Remove backward-compatible project_id FK from tasks table
-- All task-project associations now go through task_projects junction table
-- SQLite cannot DROP COLUMN with FK constraints, so we recreate the table.

-- Backfill task_projects from tasks.project_id for any orphaned tasks
INSERT OR IGNORE INTO task_projects (task_id, project_id)
  SELECT id, project_id FROM tasks
  WHERE project_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM task_projects tp WHERE tp.task_id = tasks.id);

PRAGMA foreign_keys=OFF;

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  source_branch TEXT,
  task_branch TEXT,
  linked_issue TEXT,
  work_dir TEXT,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  last_interacted_at TEXT,
  status_changed_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_pinned INTEGER DEFAULT 0 NOT NULL
);

INSERT INTO tasks_new (id, workspace_id, name, status, source_branch, task_branch, linked_issue, work_dir, archived_at, created_at, updated_at, last_interacted_at, status_changed_at, is_pinned)
  SELECT id, COALESCE(workspace_id, 'migrated-' || id), name, status, source_branch, task_branch, linked_issue, work_dir, archived_at, created_at, updated_at, last_interacted_at, status_changed_at, is_pinned
  FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

DROP INDEX IF EXISTS idx_tasks_project_id;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_branch ON tasks(task_branch);

PRAGMA foreign_keys=ON;

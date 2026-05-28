-- Remove source_branch column from tasks table
-- source_branch is now stored per-project in task_projects.source_branch
-- SQLite cannot DROP COLUMN, so we recreate the table.

PRAGMA foreign_keys=OFF;

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
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

INSERT INTO tasks_new (id, workspace_id, name, status, task_branch, linked_issue, work_dir, archived_at, created_at, updated_at, last_interacted_at, status_changed_at, is_pinned)
  SELECT id, workspace_id, name, status, task_branch, linked_issue, work_dir, archived_at, created_at, updated_at, last_interacted_at, status_changed_at, is_pinned
  FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_branch ON tasks(task_branch);

PRAGMA foreign_keys=ON;
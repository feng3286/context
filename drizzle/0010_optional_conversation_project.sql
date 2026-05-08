-- Remove NOT NULL constraint from conversations.project_id for multi-project tasks
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

-- Create a backup of the existing table
CREATE TABLE `conversations_backup` (
  `id` text PRIMARY KEY,
  `project_id` text REFERENCES `projects`(`id`) ON DELETE CASCADE,
  `task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `provider` text,
  `config` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from the old table
INSERT INTO `conversations_backup` SELECT * FROM `conversations`;

-- Drop the old table
DROP TABLE `conversations`;

-- Rename the backup table to the original name
ALTER TABLE `conversations_backup` RENAME TO `conversations`;

-- Recreate the index
CREATE INDEX `idx_conversations_task_id` ON `conversations`(`task_id`);
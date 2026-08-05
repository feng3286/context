-- Add work_dir column to conversations table (per-conversation agent cwd)
ALTER TABLE `conversations` ADD COLUMN `work_dir` text;

-- workspaces: top-level workspace containers
CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspaces_name` ON `workspaces` (`name`);
--> statement-breakpoint

-- workspace_projects: many-to-many link between workspaces and projects
CREATE TABLE `workspace_projects` (
  `workspace_id` text NOT NULL,
  `project_id` text NOT NULL,
  `added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(`workspace_id`, `project_id`),
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_projects_workspace_id` ON `workspace_projects` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_projects_project_id` ON `workspace_projects` (`project_id`);
--> statement-breakpoint

-- task_projects: many-to-many link between tasks and projects
CREATE TABLE `task_projects` (
  `task_id` text NOT NULL,
  `project_id` text NOT NULL,
  PRIMARY KEY(`task_id`, `project_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_task_projects_task_id` ON `task_projects` (`task_id`);
--> statement-breakpoint
CREATE INDEX `idx_task_projects_project_id` ON `task_projects` (`project_id`);
--> statement-breakpoint

-- Add workspace_id column to tasks table
ALTER TABLE `tasks` ADD COLUMN `workspace_id` text REFERENCES `workspaces`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `idx_tasks_workspace_id` ON `tasks` (`workspace_id`);
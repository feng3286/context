-- Add missing indexes for query performance optimization
-- See: performance optimization task

CREATE INDEX IF NOT EXISTS idx_project_remotes_remote_url ON project_remotes(remote_url);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_prc_pull_request_url_status ON pull_request_checks(pull_request_url, status);

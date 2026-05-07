import type { Workspace } from '@shared/workspaces';
import type { WorkspaceRow } from '@main/db/schema';

export function mapWorkspaceRowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

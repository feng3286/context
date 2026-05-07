import type { Workspace } from '@shared/workspaces';
import type { WorkspaceProjectRow, WorkspaceRow } from '@main/db/schema';

export function mapWorkspaceRowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    workDir: row.workDir ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

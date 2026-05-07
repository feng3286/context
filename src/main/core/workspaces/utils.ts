import type { WorkspaceRow, WorkspaceProjectRow } from '@main/db/schema';
import type { Workspace } from '@shared/workspaces';

export function mapWorkspaceRowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    workDir: row.workDir ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
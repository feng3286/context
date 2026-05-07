import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import type { Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces);
  return rows.map(mapWorkspaceRowToWorkspace);
}
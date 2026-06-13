import { LocalFileSystem } from '@main/core/fs/impl/local-fs';
import { getProjectById } from '@main/core/projects/operations/getProjects';
import { projectManager } from '@main/core/projects/project-manager';
import { log } from '@main/lib/logger';

/**
 * Generate CLAUDE.md and AGENTS.md at taskBaseDir root for multi-project tasks.
 * These files provide context for Claude Code / Codex about the workspace layout and rules.
 */
export async function generateAgentsMd(
  taskBaseDir: string,
  projectBranchSources: { projectId: string; sourceBranch: string }[]
): Promise<void> {
  // Only generate for multi-project tasks
  if (projectBranchSources.length <= 1) return;

  const fs = new LocalFileSystem(taskBaseDir);

  // Collect project info
  const projectInfos: { name: string; relPath: string }[] = [];
  for (const source of projectBranchSources) {
    const project = projectManager.getProject(source.projectId);
    if (!project) continue;
    const info = await getProjectById(source.projectId);
    if (info) {
      projectInfos.push({ name: info.name, relPath: info.name });
    }
  }

  // Skip if we couldn't resolve at least 2 projects
  if (projectInfos.length <= 1) return;

  const projectLines = projectInfos.map((p) => `- \`${p.relPath}/\` — ${p.name}`).join('\n');

  const content = `# Agent Context

## Projects

This workspace contains ${projectInfos.length} projects, each with its own git repository:

${projectLines}

## Rules

- **Do not switch branches.** Each project is checked out on the task branch.
  All changes should be committed to the current branch. Do not run \`git checkout\`,
  \`git switch\`, or any command that changes the current branch.
`;

  // Write both CLAUDE.md (for Claude Code) and AGENTS.md (for Codex)
  const files = ['CLAUDE.md', 'AGENTS.md'];
  for (const fileName of files) {
    const result = await fs.write(fileName, content);
    if (!result.success) {
      log.warn('generateAgentsMd: failed to write ' + fileName, {
        taskBaseDir,
        error: result.error,
      });
    }
  }
}

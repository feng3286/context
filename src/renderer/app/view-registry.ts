import type { ComponentType, ReactNode } from 'react';
import { homeView } from '@renderer/app/home-view';
import { mcpView } from '@renderer/features/mcp/mcp-view';
import { projectDetailView } from '@renderer/features/projects/project-detail-view';
import { projectView } from '@renderer/features/projects/view';
import { settingsView } from '@renderer/features/settings/settings-view';
import { skillsView } from '@renderer/features/skills/skills-view';
import { taskView } from '@renderer/features/tasks/view';
import { workspaceDetailView } from '@renderer/features/workspaces/workspace-detail-view';
import { workspaceListView } from '@renderer/features/workspaces/workspace-list-view';

// Define views here so we can use them in the navigate function
export const views = {
  home: workspaceListView,
  workspace: workspaceDetailView,
  skills: skillsView,
  mcp: mcpView,
  project: projectView,
  projectDetail: projectDetailView,
  task: taskView,
  settings: settingsView,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<string, ViewDefinition<any>>;

export type ViewDefinition<TParams extends object = Record<never, never>> = {
  WrapView?: ComponentType<{ children: ReactNode } & TParams>;
  TitlebarSlot?: ComponentType;
  MainPanel: ComponentType;
  RightPanel?: ComponentType;
};

type Views = typeof views;

export type ViewId = keyof Views;

export type WrapParams<TId extends ViewId> = Views[TId] extends {
  WrapView: ComponentType<infer P>;
}
  ? Omit<P, 'children'>
  : Record<never, never>;

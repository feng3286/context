import type { ReactNode } from 'react';

interface ProjectViewWrapperProps {
  children: ReactNode;
  projectId: string;
  workspaceId?: string;
}

export function ProjectViewWrapper({ children }: ProjectViewWrapperProps) {
  return <>{children}</>;
}

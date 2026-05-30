import { ExternalLink, GithubIcon, Globe } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import {
  asMounted,
  getProjectStore,
  getRepositoryStore,
  projectDisplayName,
  projectViewKind,
} from '@renderer/features/projects/stores/project-selectors';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { Button } from '@renderer/lib/ui/button';
import { Separator } from '@renderer/lib/ui/separator';

const MountedProjectTitlebarLeft = observer(function ProjectTitlebarLeft({
  projectId,
}: {
  projectId: string;
}) {
  const store = getProjectStore(projectId);
  const displayName = projectDisplayName(store);

  const repo = getRepositoryStore(projectId);
  const configuredRemote = repo?.configuredRemote;
  const remoteUrl = configuredRemote?.url;
  const repositoryUrl = repo?.repositoryUrl;

  const isGithubUrl = repositoryUrl?.includes('github.com');
  const repoLabel = repositoryUrl
    ? repositoryUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')
    : remoteUrl?.replace(/^https?:\/\//, '');

  return (
    <div className="flex items-center px-2 gap-2 h-full">
      <span className="text-sm">{displayName}</span>
      {remoteUrl && (
        <>
          <Separator
            orientation="vertical"
            className="h-4 data-[orientation=vertical]:self-center"
          />
          <button
            className="flex items-center gap-1.5 text-foreground-muted text-sm hover:text-foreground group transition-colors"
            onClick={() => void rpc.app.openExternal(remoteUrl ?? '')}
          >
            <div className="text-sm flex items-center gap-1">
              {isGithubUrl ? <GithubIcon className="size-3.5" /> : <Globe className="size-3.5" />}
              <span className="truncate">{repoLabel}</span>
            </div>
            <ExternalLink className="size-3.5 shrink-0 opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground transition-opacity" />
          </button>
        </>
      )}
    </div>
  );
});

const ProjectTitlebarLeft = observer(function ProjectTitlebarLeft({
  projectId,
}: {
  projectId: string;
}) {
  const store = getProjectStore(projectId);
  const displayName = projectDisplayName(store);
  return (
    <div className="flex items-center px-2 gap-2">
      <span className="text-sm text-foreground-muted">{displayName}</span>
    </div>
  );
});

export const ProjectTitlebar = observer(function ProjectTitlebar() {
  const {
    params: { projectId },
  } = useParams('project');
  const { navigate } = useNavigate();
  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);

  if (kind !== 'ready') {
    return <Titlebar leftSlot={<ProjectTitlebarLeft projectId={projectId} />} />;
  }

  const mounted = asMounted(store);
  if (!mounted) return <Titlebar leftSlot={<ProjectTitlebarLeft projectId={projectId} />} />;

  return (
    <Titlebar
      leftSlot={<MountedProjectTitlebarLeft projectId={projectId} />}
      rightSlot={
        <div className="flex items-center gap-2 mr-2">
          <Button
            variant="ghost"
            size="xs"
            className="h-7 text-xs"
            onClick={() => navigate('projectDetail', { projectId })}
          >
            <ExternalLink className="size-3.5" /> Details
          </Button>
        </div>
      }
    />
  );
});

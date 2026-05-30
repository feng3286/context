import { observer } from 'mobx-react-lite';
import { TaskList } from '@renderer/features/projects/components/task-view/task-list';
import { useParams } from '@renderer/lib/layout/navigation-provider';

export const ActiveProject = observer(function ActiveProject() {
  const {
    params: { workspaceId },
  } = useParams('project');

  return <TaskList workspaceId={workspaceId} />;
});

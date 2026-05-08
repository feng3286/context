import { AlignJustify, Columns2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useMemo } from 'react';
import {
  getProjectStore,
  projectDisplayName,
} from '@renderer/features/projects/stores/project-selectors';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { splitPath } from '@renderer/features/tasks/utils';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { Badge } from '@renderer/lib/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';

export const DiffToolbar = observer(function DiffToolbar() {
  const provisioned = useProvisionedTask();
  const diffView = provisioned.taskView.diffView;
  const diffStyle = diffView.diffStyle;
  const activeFile = diffView.activeFile;

  const filePath = activeFile?.path ?? undefined;
  const { filename, directory } = filePath ? splitPath(filePath) : { filename: '', directory: '' };

  const diffSourceLabel = useMemo(() => {
    if (activeFile?.group === 'staged') return 'Staged';
    if (activeFile?.group === 'disk') return 'Changed';
    if (activeFile?.group === 'pr') return 'PR';
    if (activeFile?.group === 'git') return 'Git';
    return undefined;
  }, [activeFile?.group]);

  const projectName = useMemo(() => {
    if (!provisioned.isMultiProject || !activeFile?.projectId) return undefined;
    return projectDisplayName(getProjectStore(activeFile.projectId));
  }, [provisioned.isMultiProject, activeFile?.projectId]);

  return (
    <div className="flex h-[41px] items-center gap-2 border-b border-border px-2 justify-between">
      <div className="flex items-center gap-3">
        {filePath && (
          <div className="text-sm flex items-center gap-2">
            <span className="flex items-center gap-1">
              <FileIcon filename={filename} size={12} />
              {filename}
            </span>
            <span className="text-foreground-muted text-xs">{directory}</span>
          </div>
        )}
        {diffSourceLabel && <Badge variant="outline">{diffSourceLabel}</Badge>}
        {projectName && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {projectName}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup
          size="sm"
          multiple={false}
          value={[diffStyle]}
          onValueChange={([value]) => {
            if (value) {
              diffView.setDiffStyle(value as 'unified' | 'split');
            }
          }}
        >
          <ToggleGroupItem value="unified">
            <AlignJustify className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="split">
            <Columns2 className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
});

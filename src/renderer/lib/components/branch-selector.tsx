import { GitBranch, RefreshCw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Branch } from '@shared/git';
import { Badge } from '@renderer/lib/ui/badge';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@renderer/lib/ui/combobox';
import { InputGroupButton } from '@renderer/lib/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { cn } from '@renderer/utils/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface BranchSelectorProps {
  branches: Branch[];
  value?: Branch;
  onValueChange: (value: Branch) => void;
  remoteOnly?: boolean;
  trigger?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Branch names that already have a linked worktree — flagged in the list. */
  worktreeBranches?: Set<string>;
  /** Branch currently checked out in the project's main directory — flagged in the list. */
  activeBranch?: string | null;
}

export function BranchSelector({
  branches,
  value,
  onValueChange,
  remoteOnly = false,
  trigger,
  onRefresh,
  isRefreshing = false,
  worktreeBranches,
  activeBranch,
}: BranchSelectorProps) {
  const [tab, setTab] = useState<'local' | 'remote'>(remoteOnly ? 'remote' : 'local');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const localCount = useMemo(() => branches.filter((b) => b.type === 'local').length, [branches]);
  const remoteCount = useMemo(() => branches.filter((b) => b.type === 'remote').length, [branches]);

  const filteredBranches = useMemo(() => branches.filter((b) => b.type === tab), [branches, tab]);

  const options = useMemo(
    () => filteredBranches.map((branch) => ({ value: branch, label: branch.branch })),
    [filteredBranches]
  );

  return (
    <Combobox
      items={options}
      autoHighlight
      value={value ? { value: value, label: value.branch } : undefined}
      onValueChange={(v) => v !== null && onValueChange(v.value)}
      isItemEqualToValue={(a, b) => {
        if (a.value.type !== b.value.type) return false;
        if (a.value.branch !== b.value.branch) return false;
        if (a.value.type === 'remote' && b.value.type === 'remote') {
          return a.value.remote.name === b.value.remote.name;
        }
        return true;
      }}
    >
      {trigger ?? (
        <ComboboxTrigger className="border flex border-border h-9 hover:bg-muted/30 rounded-md px-2.5 py-1 text-left text-sm outline-none items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GitBranch />
            <ComboboxValue placeholder="Select a branch" />
          </div>
        </ComboboxTrigger>
      )}
      <ComboboxContent className="min-w-(--anchor-width) pb-1 border">
        {!remoteOnly && (
          <ToggleGroup
            value={[tab]}
            onValueChange={([value]) => {
              if (value) {
                setTab(value as 'local' | 'remote');
                inputRef.current?.focus();
              }
            }}
            className="w-full border-0 border-b border-border rounded-b-none bg-transparent"
          >
            <ToggleGroupItem
              value="local"
              className="group flex-1 flex items-center gap-1 hover:bg-background-quaternary-1 data-pressed:bg-background-quaternary-2"
              disabled={localCount === 0}
            >
              Local
              <Badge
                variant="secondary"
                className="shrink-0 bg-background-2 transition-colors hover:bg-background-quaternary-1 group-data-pressed:bg-background-quaternary-3"
              >
                {localCount}
              </Badge>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="remote"
              className="group flex-1 flex items-center gap-1 hover:bg-background-quaternary-1 data-pressed:bg-background-quaternary-2"
              disabled={remoteCount === 0}
            >
              Remote
              <Badge variant="secondary" className="shrink-0 bg-background-2 transition-colors">
                {remoteCount}
              </Badge>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <ComboboxInput
          showTrigger={false}
          placeholder="Search branches"
          inputRef={inputRef}
          rightAddon={
            onRefresh && (
              <Tooltip>
                <TooltipTrigger>
                  <InputGroupButton
                    size="icon-xs"
                    className="text-foreground-muted hover:text-foreground"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    aria-label="Refresh branches"
                  >
                    <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>Refresh branches</TooltipContent>
              </Tooltip>
            )
          }
        />
        <ComboboxList>
          {(item) => (
            <ComboboxItem value={item} disabled={item.label.startsWith('_reserve')}>
              <span className="flex-1 truncate">{item.label}</span>
              {item.label === activeBranch && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      className="ml-auto shrink-0 px-1 text-[10px] font-normal"
                    >
                      active
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    This branch is checked out in the project's main directory
                  </TooltipContent>
                </Tooltip>
              )}
              {worktreeBranches?.has(item.label) && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      className="ml-auto shrink-0 gap-0.5 px-1 text-[10px] font-normal"
                    >
                      <GitBranch className="size-2.5" />
                      worktree
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>This branch is already checked out in a worktree</TooltipContent>
                </Tooltip>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>{branches.length === 0 ? 'no branches exist' : 'no results'}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

import { action, computed, makeAutoObservable, observable } from 'mobx';

export type SelectionState = 'all' | 'none' | 'partial';

export class ProjectChangesViewStore {
  unstagedSelection = observable.set<string>();
  stagedSelection = observable.set<string>();
  expandedUnstaged: boolean = true;
  expandedStaged: boolean = true;

  constructor() {
    makeAutoObservable(this);
  }

  get unstagedSelectionState(): SelectionState {
    // This will be computed based on actual file count when used
    return 'none';
  }

  get stagedSelectionState(): SelectionState {
    return 'none';
  }

  toggleUnstagedItem(path: string): void {
    if (this.unstagedSelection.has(path)) {
      this.unstagedSelection.delete(path);
    } else {
      this.unstagedSelection.add(path);
    }
  }

  toggleAllUnstaged(total: number): void {
    if (this.unstagedSelection.size === total) {
      this.unstagedSelection.clear();
    } else {
      // Caller will add all paths
      this.unstagedSelection.clear();
    }
  }

  clearUnstagedSelection(): void {
    this.unstagedSelection.clear();
  }

  toggleStagedItem(path: string): void {
    if (this.stagedSelection.has(path)) {
      this.stagedSelection.delete(path);
    } else {
      this.stagedSelection.add(path);
    }
  }

  toggleAllStaged(total: number): void {
    if (this.stagedSelection.size === total) {
      this.stagedSelection.clear();
    } else {
      this.stagedSelection.clear();
    }
  }

  clearStagedSelection(): void {
    this.stagedSelection.clear();
  }

  toggleExpanded(section: 'unstaged' | 'staged'): void {
    if (section === 'unstaged') {
      this.expandedUnstaged = !this.expandedUnstaged;
    } else if (section === 'staged') {
      this.expandedStaged = !this.expandedStaged;
    }
  }

  dispose(): void {
    this.unstagedSelection.clear();
    this.stagedSelection.clear();
  }
}

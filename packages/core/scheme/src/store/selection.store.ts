import { action, makeObservable, observable, ObservableSet } from 'mobx';

export class SelectionStore {
  readonly selectedIds = new ObservableSet<string>();
  readonly inSelectedIds = new ObservableSet<string>();
  @observable highlightId: string | null = null;

  constructor() {
    makeObservable(this);
  }

  isSelected(id: string) {
    return this.selectedIds.has(id);
  }

  isInSelected(id: string) {
    return this.inSelectedIds.has(id);
  }

  isHighlighted(targetId?: string) {
    return this.highlightId === targetId;
  }

  /** Selects exactly one node, replacing any previous selection — for programmatic selection (e.g. `focusNode`), distinct from the canvas's own drag/click selection gestures which read `selectedIds`/`inSelectedIds` directly. */
  @action select(id: string): void {
    this.selectedIds.clear();
    this.inSelectedIds.clear();
    this.selectedIds.add(id);
    this.inSelectedIds.add(id);
  }

  @action clear(): void {
    this.selectedIds.clear();
    this.inSelectedIds.clear();
    this.highlightId = null;
  }
}

import { action, computed, makeObservable, ObservableMap } from 'mobx';
import type { IValidationIssue } from './validation.types.js';

/**
 * Issues per node per source (runtime state, ADR 0068 (private)). Setting a source's issues for a node replaces
 * only that source's issues.
 */
export class ValidationStore {
  /** nodeId -> source -> issues */
  private readonly issues = new ObservableMap<string, Map<string, IValidationIssue[]>>();
  private readonly pending = new ObservableMap<string, number>();
  private visibleIdResolver: (nodeId: string) => string = (id) => id;

  constructor() {
    makeObservable(this);
  }

  /** Maps a node id to the id of the icon that is actually drawn for it (`resolveVisibleIconId`). */
  setVisibleIdResolver(resolver: (nodeId: string) => string) {
    this.visibleIdResolver = resolver;
  }

  @action setIssues(nodeId: string, source: string, issues: IValidationIssue[]) {
    const current = this.issues.get(nodeId);
    if (issues.length === 0) {
      if (!current?.has(source)) return;
      const next = new Map(current);
      next.delete(source);
      if (next.size === 0) this.issues.delete(nodeId);
      else this.issues.set(nodeId, next);
      return;
    }
    this.issues.set(nodeId, new Map([...(current ?? []), [source, issues]]));
  }

  @action clearNode(nodeId: string) {
    this.issues.delete(nodeId);
  }

  @action clearAll() {
    this.issues.clear();
    this.pending.clear();
  }

  @action markPending(nodeId: string, source: string) {
    const key = `${nodeId}\u0000${source}`;
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
  }

  @action markSettled(nodeId: string, source: string) {
    const key = `${nodeId}\u0000${source}`;
    const count = (this.pending.get(key) ?? 0) - 1;
    if (count <= 0) this.pending.delete(key);
    else this.pending.set(key, count);
  }

  issuesFor(nodeId: string, field?: string): IValidationIssue[] {
    const bySource = this.issues.get(nodeId);
    if (!bySource) return [];
    const all = [...bySource.values()].flat();
    if (typeof field !== 'string') return all;
    return all.filter((issue) => issue.field === field);
  }

  hasErrors(nodeId: string): boolean {
    return this.issuesFor(nodeId).some((issue) => issue.severity === 'error');
  }

  hasWarnings(nodeId: string): boolean {
    return this.issuesFor(nodeId).some((issue) => issue.severity === 'warning');
  }

  @computed get allIssues(): IValidationIssue[] {
    const result: IValidationIssue[] = [];
    for (const bySource of this.issues.values()) {
      for (const list of bySource.values()) result.push(...list);
    }
    return result;
  }

  @computed get errorCount(): number {
    return this.allIssues.filter((issue) => issue.severity === 'error').length;
  }

  @computed get warningCount(): number {
    return this.allIssues.filter((issue) => issue.severity === 'warning').length;
  }

  @computed get pendingCount(): number {
    return this.pending.size;
  }

  @computed get isPending(): boolean {
    return this.pending.size > 0;
  }

  /** Issues grouped by the id of the icon that is drawn for the node (a hidden descendant maps to its visible ancestor). */
  @computed get issuesByIcon(): Map<string, IValidationIssue[]> {
    const result = new Map<string, IValidationIssue[]>();
    for (const [nodeId, bySource] of this.issues) {
      const iconId = this.visibleIdResolver(nodeId);
      let list = result.get(iconId);
      if (!list) {
        list = [];
        result.set(iconId, list);
      }
      for (const issues of bySource.values()) list.push(...issues);
    }
    return result;
  }
}

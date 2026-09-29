import type { ICommitInfo, IProjectSnapshot, IVersionStore, TCommitKind } from '@falang/versioning';

/**
 * `IVersionStore` over `globalThis.falang.versioning` (ADR 0025 (private),
 * package E2) — mirrors `@falang/workflow-client-common`'s `HttpVersionStore` one method to one IPC
 * call, `projectDir` standing in for that store's `projectId`. One instance per open project, held
 * by `DesktopProjectStore.versionHistory`.
 */
export class ElectronVersionStore implements IVersionStore {
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  listCommits(): Promise<ICommitInfo[]> {
    return globalThis.falang.versioning.listCommits(this.projectDir);
  }

  getSnapshot(commitId: string): Promise<IProjectSnapshot> {
    return globalThis.falang.versioning.getSnapshot(this.projectDir, commitId);
  }

  getWorkingCopy(): Promise<IProjectSnapshot> {
    return globalThis.falang.versioning.getWorkingCopy(this.projectDir);
  }

  commit(params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> {
    return globalThis.falang.versioning.commit(this.projectDir, params);
  }

  nameCommit(commitId: string, message: string): Promise<ICommitInfo> {
    return globalThis.falang.versioning.nameCommit(this.projectDir, commitId, message);
  }

  restore(commitId: string): Promise<ICommitInfo> {
    return globalThis.falang.versioning.restore(this.projectDir, commitId);
  }
}

/** What the native menu needs to know about the renderer — reported by it over `IPC.menuSetContext`. */
export interface IMenuContext {
  /** The open project's type (`text`, `logic`, `simple-code-<language>`), or `null` on the welcome screen. */
  readonly projectType: string | null;
}

let current: IMenuContext = { projectType: null };

export const getMenuContext = (): IMenuContext => current;

/** Returns `true` when the context actually changed (the caller then rebuilds the menu). */
export const setMenuContext = (next: IMenuContext): boolean => {
  if (next.projectType === current.projectType) return false;
  current = { projectType: next.projectType };
  return true;
};

export interface IProjectMenuAvailability {
  /** Any project open: PDF export, version history, agent panel. */
  readonly hasProject: boolean;
  /** `logic` projects only: the export configuration and "Export Code". */
  readonly logicExport: boolean;
  /** `simple-code-*` projects only. */
  readonly codeExport: boolean;
}

/** Which Project-menu items apply; the rest are hidden (not merely disabled). */
export const getProjectMenuAvailability = (projectType: string | null): IProjectMenuAvailability => ({
  hasProject: projectType !== null,
  logicExport: projectType === 'logic',
  codeExport: projectType?.startsWith('simple-code-') ?? false,
});

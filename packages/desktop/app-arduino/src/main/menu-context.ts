/** What the native menu needs to know about the renderer — reported by it over `IPC.menuSetContext`. */
export interface IMenuContext {
  /** `'arduino'` while a project is open, `null` on the welcome screen. Nothing in this app's menu depends on more. */
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

/** The whole Sketch menu needs an open project; it is hidden (not disabled) while none is open. */
export const hasOpenProject = (context: IMenuContext): boolean => context.projectType !== null;

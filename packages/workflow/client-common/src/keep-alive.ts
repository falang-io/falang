/** How many scheme tabs stay mounted (hidden) after being active — switching back to one of them costs nothing. */
export const KEEP_ALIVE_SCHEMES = 5;

/** Marks `id` as the most recently active: moved to the end, the least recently active ones past `max` dropped. */
export const touchKeepAlive = (list: readonly string[], id: string, max: number = KEEP_ALIVE_SCHEMES): string[] => {
  const next = [...list.filter((item) => item !== id), id];
  return next.length > max ? next.slice(next.length - max) : next;
};

/** Drops ids that are no longer open (closed tabs unmount). */
export const pruneKeepAlive = (list: readonly string[], isOpen: (id: string) => boolean): string[] =>
  list.filter((id) => isOpen(id));

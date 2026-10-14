import type { IValidationIssue } from './validation.types.js';

export interface IPillIssueSite {
  /** The id of the icon that is drawn for the issues (`ValidationStore.issuesByIcon` key). */
  iconId: string;
  x: number;
  y: number;
  hasError: boolean;
}

/**
 * Orders the icons with issues for stepping through them: errors before warnings, then top to bottom, left to right
 * (ids break ties so the order is stable).
 */
export const orderIssueSites = (sites: readonly IPillIssueSite[]): string[] =>
  sites
    .toSorted(
      (a, b) => Number(b.hasError) - Number(a.hasError) || a.y - b.y || a.x - b.x || (a.iconId < b.iconId ? -1 : 1),
    )
    .map((site) => site.iconId);

/** The icon after `current` in `ordered`, wrapping around; the first one when `current` is not in the list. */
export const pickNextIssueIcon = (ordered: readonly string[], current: string | null): string | null => {
  if (ordered.length === 0) return null;
  const index = current === null ? -1 : ordered.indexOf(current);
  return ordered[(index + 1) % ordered.length] ?? null;
};

export const countIssues = (issues: readonly IValidationIssue[]) => ({
  errors: issues.filter((issue) => issue.severity === 'error').length,
  warnings: issues.filter((issue) => issue.severity === 'warning').length,
});

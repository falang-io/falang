/**
 * Per-user overridable limits — see ADR 0038 (private) §2 ("Limits
 * are per user, not one global constant"). `UserLimitsService.getLimits` merges the env-level
 * defaults (`MAX_PROJECT_FILES_BYTES`/`MAX_FILE_BYTES`/`DEV_FILE_TTL_HOURS`/`INGRESS_FILE_TTL_HOURS`/`MAX_CONCURRENT_PROD_VERSIONS`)
 * with a user's own override row, if any.
 */
export interface IUserLimits {
  readonly maxProjectFilesBytes: number;
  readonly maxFileBytes: number;
  readonly devFileTtlHours: number;
  readonly ingressFileTtlHours: number;
  /** Max published (prod) workflow versions running at once per project (`MAX_CONCURRENT_PROD_VERSIONS`). */
  readonly maxConcurrentProdVersions: number;
}

/** A field set to `null` clears that override (falls back to the env default); an omitted field leaves it untouched. */
export type IUserLimitsOverrides = Partial<Record<keyof IUserLimits, number | null>>;

/** `GET`/`PUT /admin/users/:id/limits` response shape. */
export interface IUserLimitsResponse {
  readonly effective: IUserLimits;
  readonly overrides: Partial<IUserLimits>;
}

/**
 * `SINGLE_USER_MODE=true`: the deployment has exactly one user who is signed in without a password — the desktop
 * FalangFlow app (ADR 0072, private) runs the backend like that. Reported to the client as `IAuthUser.singleUser`, which
 * hides everything multi-user (other users, the support chat, password changes); `defaultPasswordInUse` is always
 * `false` there. Read per call so the flag follows the live environment.
 */
export const isSingleUserMode = (env: Record<string, string | undefined> = process.env): boolean =>
  (env.SINGLE_USER_MODE ?? '').trim().toLowerCase() === 'true';

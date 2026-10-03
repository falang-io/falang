export type TFetch = typeof fetch;

/** Thrown by a provider when the vendor can't be reached — never treated as a pass. */
export class CaptchaUnavailableError extends Error {}

/** One provider per file; adding another vendor = one more implementation + a case in `CaptchaService`. */
export interface ICaptchaProvider {
  readonly name: string;
  verify: (token: string, ip: string | null) => Promise<boolean>;
}

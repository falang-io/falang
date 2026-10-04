/** What the parent holds on to: read the token at submit time, reset after a failed submit. */
export interface ICaptchaControl {
  getToken: () => string;
  reset: () => void;
}

/** An API error whose body carried a machine-readable `code` (login's `not_activated` / `email_not_verified`). */
export class ApiCodedError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'ApiCodedError';
  }
}

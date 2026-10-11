/** An API error whose body carried a machine-readable `code` (login's `not_activated` / `email_not_verified`, a start's `project_suspended`). */
export class ApiCodedError extends Error {
  readonly code: string;
  /** The parsed error body, when the server sent one (e.g. `{ code: 'project_suspended', reason: 'balance' }`). */
  readonly body: unknown;

  constructor(message: string, code: string, body?: unknown) {
    super(message);
    this.code = code;
    this.body = body;
    this.name = 'ApiCodedError';
  }
}

/**
 * Thrown by `request()` (see `api-client.ts`) when a `PATCH`/`DELETE` on a document 409s because it
 * is actively locked by an agent — see ADR 0029 (private)'s "Document
 * locks" decision and `DocumentsService`'s `assertNotLockedByAnotherOwner`. `documentId` is filled
 * in by the caller (the generic `request()` helper doesn't know which document a given call was
 * for), not by the response body.
 */
export class DocumentLockedError extends Error {
  readonly documentId: string;
  readonly lockExpiresAt: string;

  constructor(documentId: string, lockExpiresAt: string) {
    super('Document is locked by an agent');
    this.documentId = documentId;
    this.lockExpiresAt = lockExpiresAt;
  }
}

import { Injectable } from '@nestjs/common';

export interface IPendingOAuth2State {
  readonly projectId: string;
  readonly credentialId: string;
  readonly vendor: string;
  readonly codeVerifier?: string;
}

const STATE_TTL_MS = 10 * 60_000;

/**
 * In-memory `state`->pending-connection map for the OAuth2 authorization-code flow
 * (`oauth2.controller.ts`) — mirrors `activepieces/src/routes/poll.ts`'s existing in-memory,
 * process-lifetime trigger-state pattern (restart loses in-flight connect attempts, acceptable for
 * this app's single-instance MVP posture, see ADR 0002). The map itself is the source of truth for
 * `state` validity — a plain unguessable random token is as strong as an HMAC-signed payload here,
 * and PKCE's `code_verifier` must live server-side regardless — see ADR 0015 (private).
 */
@Injectable()
export class OAuth2PendingStateService {
  private readonly states = new Map<string, { readonly value: IPendingOAuth2State; readonly expiresAt: number }>();

  set(state: string, value: IPendingOAuth2State): void {
    this.states.set(state, { value, expiresAt: Date.now() + STATE_TTL_MS });
    setTimeout(() => this.states.delete(state), STATE_TTL_MS).unref();
  }

  /** Single-use: deletes on read so a replayed callback can't reuse the same code/state. */
  consume(state: string): IPendingOAuth2State | undefined {
    const entry = this.states.get(state);
    this.states.delete(state);
    if (!entry || entry.expiresAt < Date.now()) return;
    return entry.value;
  }
}

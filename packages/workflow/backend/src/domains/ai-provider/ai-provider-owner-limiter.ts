import { HttpStatus } from '@nestjs/common';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';

/** In-memory per-owner slots (one backend replica); `acquire` throws the relay's 429 when the owner has none free. */
export class AiProviderOwnerLimiter {
  private readonly inFlight = new Map<string, number>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  acquire(ownerId: string): () => void {
    const current = this.inFlight.get(ownerId) ?? 0;
    if (current >= this.max) {
      throw aiProviderRelayError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ai_provider_busy',
        `Too many built-in AI provider calls running at once for this account (limit ${this.max}) — retry later`,
      );
    }
    this.inFlight.set(ownerId, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.inFlight.get(ownerId) ?? 1) - 1;
      if (left <= 0) this.inFlight.delete(ownerId);
      else this.inFlight.set(ownerId, left);
    };
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * In-memory (per replica) cap on simultaneous vendor calls: per user, and for the whole process. `acquire`
 * returns a release function that must be called exactly once, in a `finally`.
 */
export class AgentChatConcurrencyLimiter {
  private readonly perUser = new Map<string, number>();
  private total = 0;
  private readonly maxPerUser: number;
  private readonly maxTotal: number;

  constructor(maxPerUser: number, maxTotal: number) {
    this.maxPerUser = maxPerUser;
    this.maxTotal = maxTotal;
  }

  acquire(userId: string): () => void {
    if (this.total >= this.maxTotal) {
      throw new HttpException(
        {
          code: 'agent_overloaded',
          message: 'The AI agent is overloaded right now — try again in a minute',
          statusCode: 503,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const current = this.perUser.get(userId) ?? 0;
    if (current >= this.maxPerUser) {
      throw new HttpException(
        {
          code: 'agent_busy',
          message: `Too many AI agent requests running at once (limit ${this.maxPerUser}) — wait for the previous one to finish`,
          statusCode: 429,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.perUser.set(userId, current + 1);
    this.total += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total -= 1;
      const left = (this.perUser.get(userId) ?? 1) - 1;
      if (left <= 0) this.perUser.delete(userId);
      else this.perUser.set(userId, left);
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { LessThan, MoreThanOrEqual, type Repository } from 'typeorm';
import { authMailLimitedTotal } from '../../metrics/metrics.js';
import { AuthMailEvent, type TAuthMailKind } from './auth-mail-event.entity.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_MAILS_PER_ADDRESS = 5;
export const MAX_MAILS_PER_IP = 20;
/** Rows older than this are deleted by the sweep (the window itself is 24 h). */
const RETENTION_MS = 2 * WINDOW_MS;

const hashAddress = (address: string): string =>
  createHash('sha256').update(address.trim().toLowerCase()).digest('hex');

/**
 * Account-mail limits that survive a restart (security audit P1-13): over 24 h at most 5 mails to one address and
 * 20 per client IP. A refused mail is silently skipped by the caller — the HTTP answer stays the same.
 */
@Injectable()
export class MailLimitsService {
  private readonly events: Repository<AuthMailEvent>;

  constructor(@InjectRepository(AuthMailEvent) events: Repository<AuthMailEvent>) {
    this.events = events;
  }

  /** Records the mail and returns `true` when it may be sent; `false` (nothing recorded) when a limit is reached. */
  async tryConsume(kind: TAuthMailKind, address: string, ip: string | null, now: Date = new Date()): Promise<boolean> {
    const since = new Date(now.getTime() - WINDOW_MS);
    const addressHash = hashAddress(address);
    const perAddress = await this.events.count({ where: { addressHash, createdAt: MoreThanOrEqual(since) } });
    if (perAddress >= MAX_MAILS_PER_ADDRESS) {
      authMailLimitedTotal.inc({ scope: 'address' });
      return false;
    }
    if (ip) {
      const perIp = await this.events.count({ where: { ip, createdAt: MoreThanOrEqual(since) } });
      if (perIp >= MAX_MAILS_PER_IP) {
        authMailLimitedTotal.inc({ scope: 'ip' });
        return false;
      }
    }
    await this.events.save(this.events.create({ kind, addressHash, ip, createdAt: now }));
    return true;
  }

  async deleteExpired(now: Date = new Date()): Promise<void> {
    await this.events.delete({ createdAt: LessThan(new Date(now.getTime() - RETENTION_MS)) });
  }
}

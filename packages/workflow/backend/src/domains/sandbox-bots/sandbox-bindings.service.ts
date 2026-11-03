// oxlint-disable no-await-in-loop -- liveness reads the shared TTL setting.
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  SANDBOX_LINK_PAYLOAD_PREFIX,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import { In, IsNull, LessThan, type Repository } from 'typeorm';
import { Document } from '../projects/documents/document.entity.js';
import { SandboxBotBinding } from './sandbox-bot-binding.entity.js';
import { SandboxBotLinkCode } from './sandbox-bot-link-code.entity.js';
import { SandboxBotSettingsService } from './sandbox-bot-settings.service.js';

/** A link code is valid for 15 minutes (ADR 0073 (private)). */
export const LINK_CODE_TTL_MS = 15 * 60_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const hashLinkCode = (code: string): string => createHash('sha256').update(code).digest('hex');

export type TRedeemResult = { readonly ok: true; readonly binding: SandboxBotBinding } | { readonly ok: false };

/** Chat bindings and link codes of the sandbox bots (ADR 0073 (private)): creation, sliding expiry, redemption, sweep. */
@Injectable()
export class SandboxBindingsService {
  private readonly bindings: Repository<SandboxBotBinding>;
  private readonly codes: Repository<SandboxBotLinkCode>;
  private readonly documents: Repository<Document>;
  private readonly settings: SandboxBotSettingsService;
  now: () => Date = () => new Date();

  constructor(
    @InjectRepository(SandboxBotBinding) bindings: Repository<SandboxBotBinding>,
    @InjectRepository(SandboxBotLinkCode) codes: Repository<SandboxBotLinkCode>,
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(SandboxBotSettingsService) settings: SandboxBotSettingsService,
  ) {
    this.bindings = bindings;
    this.codes = codes;
    this.documents = documents;
    this.settings = settings;
  }

  /** The instance with `credentialId` in the project's integrations document, if any. */
  async findInstance(projectId: string, credentialId: string): Promise<IIntegrationInstance | undefined> {
    const docs = await this.documents.find({ where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId } });
    for (const document of docs) {
      const data = document.data as IIntegrationsDocumentData | null;
      const instance = data?.instances.find((candidate) => candidate.id === credentialId);
      if (instance) return instance;
    }
  }

  expiresAt(binding: SandboxBotBinding, ttlMinutes: number): Date {
    return new Date(binding.lastActivityAt.getTime() + ttlMinutes * MINUTE_MS);
  }

  /** The chat's binding row (live or expired), or `null`. */
  findBinding(vendor: string, chatId: string): Promise<SandboxBotBinding | null> {
    return this.bindings.findOneBy({ vendor, chatId });
  }

  async isLive(binding: SandboxBotBinding): Promise<boolean> {
    const ttl = await this.settings.getBindingTtlMinutes();
    return this.expiresAt(binding, ttl).getTime() > this.now().getTime();
  }

  async listLive(projectId: string, credentialId: string): Promise<{ binding: SandboxBotBinding; expiresAt: Date }[]> {
    const ttl = await this.settings.getBindingTtlMinutes();
    const nowMs = this.now().getTime();
    const rows = await this.bindings.find({ where: { projectId, credentialId }, order: { createdAt: 'ASC' } });
    return rows
      .map((binding) => ({ binding, expiresAt: this.expiresAt(binding, ttl) }))
      .filter((entry) => entry.expiresAt.getTime() > nowMs);
  }

  findById(projectId: string, credentialId: string, bindingId: string): Promise<SandboxBotBinding | null> {
    return this.bindings.findOneBy({ id: bindingId, projectId, credentialId });
  }

  async remove(binding: SandboxBotBinding): Promise<void> {
    await this.bindings.delete({ id: binding.id });
  }

  async touch(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.bindings.update({ id: In([...ids]) }, { lastActivityAt: this.now() });
  }

  /** Every live binding of `chatIds` for `vendor` (a chat without one is simply absent from the result). */
  async findLiveForChats(vendor: string, chatIds: readonly string[]): Promise<SandboxBotBinding[]> {
    if (chatIds.length === 0) return [];
    const rows = await this.bindings.find({ where: { vendor, chatId: In([...chatIds]) } });
    const live: SandboxBotBinding[] = [];
    for (const row of rows) {
      if (await this.isLive(row)) live.push(row);
    }
    return live;
  }

  /** Creates a one-time code; the raw `fl_`-less code is returned once, only its hash is stored. */
  async createLinkCode(params: {
    vendor: string;
    projectId: string;
    credentialId: string;
    createdBy: string | null;
  }): Promise<{ code: string; expiresAt: Date }> {
    const code = randomBytes(18).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + LINK_CODE_TTL_MS);
    await this.codes.save(this.codes.create({ ...params, codeHash: hashLinkCode(code), expiresAt, usedAt: null }));
    return { code, expiresAt };
  }

  /** The raw code of a start payload, or `null` when the payload is not one of ours. */
  parsePayload(payload: string | null): string | null {
    if (!payload?.startsWith(SANDBOX_LINK_PAYLOAD_PREFIX)) return null;
    return payload.slice(SANDBOX_LINK_PAYLOAD_PREFIX.length);
  }

  /** Burns the code and (re)binds the chat. Fails for an unknown, used, expired or foreign-vendor code. */
  async redeem(
    vendor: string,
    code: string,
    chat: { chatId: string; chatTitle: string | null },
  ): Promise<TRedeemResult> {
    const row = await this.codes.findOneBy({ codeHash: hashLinkCode(code) });
    const now = this.now();
    if (!row || row.vendor !== vendor || row.usedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
      return { ok: false };
    }
    const claimed = await this.codes.update({ id: row.id, usedAt: IsNull() }, { usedAt: now });
    if (claimed.affected !== 1) return { ok: false };
    const existing = await this.bindings.findOneBy({ vendor, chatId: chat.chatId });
    const binding = this.bindings.create({
      ...existing,
      vendor,
      chatId: chat.chatId,
      projectId: row.projectId,
      credentialId: row.credentialId,
      chatTitle: chat.chatTitle ?? existing?.chatTitle ?? null,
      createdBy: row.createdBy,
      lastActivityAt: now,
    });
    return { ok: true, binding: await this.bindings.save(binding) };
  }

  /** Deletes bindings expired for more than a day (the "expired" reply stays accurate meanwhile) and old link codes. */
  async sweep(): Promise<void> {
    const ttl = await this.settings.getBindingTtlMinutes();
    const now = this.now().getTime();
    await this.bindings.delete({ lastActivityAt: LessThan(new Date(now - ttl * MINUTE_MS - DAY_MS)) });
    await this.codes.delete({ expiresAt: LessThan(new Date(now - DAY_MS)) });
  }
}

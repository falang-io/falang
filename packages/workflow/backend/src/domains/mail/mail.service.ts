import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mailTotal } from '../metrics/metrics.js';

export interface IMailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** The slice of a nodemailer transport `MailService` needs — the seam tests replace with a capturing fake. */
export interface IMailTransport {
  sendMail: (message: IMailMessage) => Promise<unknown>;
}

/** `null` when `SMTP_URL` is unset (mail not configured). */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface ISendMailInput {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: IMailTransport | null;
  private readonly config: ConfigService;
  private warnedAboutClientUrl = false;

  constructor(@Inject(MAIL_TRANSPORT) transport: IMailTransport | null, @Inject(ConfigService) config: ConfigService) {
    this.transport = transport;
    this.config = config;
  }

  get isConfigured(): boolean {
    return this.transport !== null;
  }

  /** Never throws: a missing transport or a delivery error is logged and reported as `{ sent: false }`. */
  async send(input: ISendMailInput): Promise<{ sent: boolean }> {
    if (!this.transport) {
      mailTotal.inc({ result: 'skipped' });
      this.logger.warn(`SMTP_URL is not set; mail "${input.subject}" was not sent`);
      return { sent: false };
    }
    try {
      await this.transport.sendMail({
        from: this.config.get<string>('MAIL_FROM', 'noreply@localhost'),
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(typeof input.html === 'string' ? { html: input.html } : {}),
      });
      mailTotal.inc({ result: 'sent' });
      return { sent: true };
    } catch (error) {
      mailTotal.inc({ result: 'failed' });
      this.logger.error(
        `Sending mail "${input.subject}" failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { sent: false };
    }
  }

  /** Absolute link into the client app. `CLIENT_PUBLIC_URL`, else the origin of `BACKEND_PUBLIC_URL` (warned once). */
  buildClientLink(path: string): string {
    let base = this.config.get<string>('CLIENT_PUBLIC_URL', '').trim();
    if (!base) {
      const backend = this.config.get<string>('BACKEND_PUBLIC_URL', '').trim();
      if (!this.warnedAboutClientUrl) {
        this.warnedAboutClientUrl = true;
        this.logger.warn('CLIENT_PUBLIC_URL is not set; links in e-mails fall back to the BACKEND_PUBLIC_URL origin');
      }
      try {
        base = backend ? new URL(backend).origin : '';
      } catch {
        base = '';
      }
    }
    return `${base.replace(/\/+$/, '')}${path}`;
  }
}

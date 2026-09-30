import type { IMailMessage, IMailTransport } from '../domains/mail/mail.service.js';

/** Test double for `MAIL_TRANSPORT`: records every message instead of talking to SMTP. */
export class CapturingMailTransport implements IMailTransport {
  readonly messages: IMailMessage[] = [];

  sendMail(message: IMailMessage): Promise<unknown> {
    this.messages.push(message);
    return Promise.resolve();
  }

  to(address: string): IMailMessage[] {
    return this.messages.filter((message) => message.to === address);
  }

  /** The `?verifyEmail=` / `?resetPassword=` token from the latest mail to `address`. */
  latestToken(address: string, param: 'verifyEmail' | 'resetPassword'): string {
    const mails = this.to(address);
    const last = mails.at(-1);
    const match = last ? new RegExp(`[?&]${param}=([^\\s&"<]+)`).exec(last.text) : null;
    if (!match?.[1]) throw new Error(`No ${param} mail captured for ${address}`);
    return decodeURIComponent(match[1]);
  }
}

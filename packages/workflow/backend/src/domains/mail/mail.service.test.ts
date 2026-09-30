import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { MailService, type IMailMessage, type IMailTransport } from './mail.service.js';

const config = (values: Record<string, string>) => new ConfigService(values);

describe('MailService', () => {
  it('reports not configured and never throws without a transport', async () => {
    const service = new MailService(null, config({}));
    expect(service.isConfigured).toBe(false);
    await expect(service.send({ to: 'a@b.c', subject: 's', text: 't' })).resolves.toEqual({ sent: false });
  });

  it('sends through the transport with MAIL_FROM', async () => {
    const sent: IMailMessage[] = [];
    const transport: IMailTransport = {
      sendMail: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    };
    const service = new MailService(transport, config({ MAIL_FROM: 'hi@falang.test' }));
    await expect(service.send({ to: 'a@b.c', subject: 's', text: 't', html: '<b>t</b>' })).resolves.toEqual({
      sent: true,
    });
    expect(sent).toEqual([{ from: 'hi@falang.test', to: 'a@b.c', subject: 's', text: 't', html: '<b>t</b>' }]);
  });

  it('swallows a transport error', async () => {
    const transport: IMailTransport = { sendMail: vi.fn().mockRejectedValue(new Error('boom')) };
    const service = new MailService(transport, config({}));
    await expect(service.send({ to: 'a@b.c', subject: 's', text: 't' })).resolves.toEqual({ sent: false });
  });

  it('builds client links from CLIENT_PUBLIC_URL, falling back to the backend origin', () => {
    expect(new MailService(null, config({ CLIENT_PUBLIC_URL: 'https://app.test/' })).buildClientLink('/?x=1')).toBe(
      'https://app.test/?x=1',
    );
    expect(
      new MailService(null, config({ BACKEND_PUBLIC_URL: 'https://api.test:4000/some' })).buildClientLink('/?x=1'),
    ).toBe('https://api.test:4000/?x=1');
  });
});

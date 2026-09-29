import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationWebhookController } from './integration-webhook.controller.js';
import type { IntegrationsRuntimeService } from './integrations-runtime.service.js';

const buildController = (findWebhookHandler: IntegrationsRuntimeService['findWebhookHandler']) =>
  new IntegrationWebhookController({ findWebhookHandler } as unknown as IntegrationsRuntimeService);

describe('IntegrationWebhookController', () => {
  it('reconstructs the Request from the raw body bytes and the real content-type, not a re-serialized @Body()', async () => {
    const handler = vi.fn((_request: Request) => new Response(null, { status: 200 }));
    const controller = buildController(vi.fn().mockReturnValue(handler));

    const rawBody = Buffer.from('event=ONCRMLEADADD&data%5BFIELDS%5D%5BID%5D=123');
    const result = await controller.handleRoot('bitrix24', 'cred-1', 'dev', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody,
    });

    expect(result).toEqual({ status: 200 });
    const capturedRequest = handler.mock.calls[0][0];
    expect(capturedRequest.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    // The regression this test guards against: the old implementation ran the parsed @Body() object
    // through JSON.stringify, which would have turned this into a JSON string — not the original
    // form-urlencoded bytes a vendor's own body parser (e.g. bitrix24's parseBracketFormBody) expects.
    await expect(capturedRequest.text()).resolves.toBe('event=ONCRMLEADADD&data%5BFIELDS%5D%5BID%5D=123');
  });

  it('passes a JSON body through unchanged (e.g. ЮKassa/Telegram notifications)', async () => {
    const handler = vi.fn((_request: Request) => new Response(null, { status: 200 }));
    const controller = buildController(vi.fn().mockReturnValue(handler));

    const rawBody = Buffer.from(JSON.stringify({ type: 'notification', event: 'payment.succeeded' }));
    await controller.handleRoot('yookassa', 'cred-1', 'dev', {
      headers: { 'content-type': 'application/json' },
      rawBody,
    });

    const capturedRequest = handler.mock.calls[0][0];
    expect(capturedRequest.headers.get('content-type')).toBe('application/json');
    await expect(capturedRequest.text()).resolves.toBe(
      JSON.stringify({ type: 'notification', event: 'payment.succeeded' }),
    );
  });

  it('routes :uri through to findWebhookHandler and the reconstructed request', async () => {
    const findWebhookHandler = vi.fn().mockReturnValue(vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const controller = buildController(findWebhookHandler);

    await controller.handleWithUri('webhook', 'cred-1', 'prod', 'trigger-doc-1', {
      headers: {},
      rawBody: Buffer.from('{}'),
    });

    expect(findWebhookHandler).toHaveBeenCalledWith('webhook', 'cred-1', 'prod', 'trigger-doc-1');
  });

  it('rejects an invalid env before ever looking up a handler', async () => {
    const findWebhookHandler = vi.fn();
    const controller = buildController(findWebhookHandler);

    await expect(
      controller.handleRoot('webhook', 'cred-1', 'staging', { headers: {}, rawBody: Buffer.from('{}') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findWebhookHandler).not.toHaveBeenCalled();
  });

  it('404s when no handler is registered for this vendor/credential/env', async () => {
    const controller = buildController(vi.fn().mockReturnValue(null));

    await expect(
      controller.handleRoot('webhook', 'cred-1', 'dev', { headers: {}, rawBody: Buffer.from('{}') }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits the content-type header entirely when the real request had none', async () => {
    const handler = vi.fn((_request: Request) => new Response(null, { status: 200 }));
    const controller = buildController(vi.fn().mockReturnValue(handler));

    await controller.handleRoot('webhook', 'cred-1', 'dev', { headers: {}, rawBody: Buffer.from('') });

    const capturedRequest = handler.mock.calls[0][0];
    expect(capturedRequest.headers.has('content-type')).toBe(false);
  });
});

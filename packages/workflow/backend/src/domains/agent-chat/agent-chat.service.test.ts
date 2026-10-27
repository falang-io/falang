// oxlint-disable max-lines, no-undefined, unicorn/no-useless-undefined, unicorn/catch-error-name, unicorn/no-await-expression-member, init-declarations, no-unsafe-optional-chaining -- test fakes and deferred-promise scaffolding.
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSettingsService } from '../admin/app-settings/agent-settings.service.js';
import type { ProjectsService } from '../projects/projects/projects.service.js';
import { metricsRegistry } from '../metrics/metrics-registry.js';
import '../metrics/metrics.js';
import { AgentChatVendorError } from './agent-chat-transport.js';
import { AgentChatService } from './agent-chat.service.js';
import type { DbAgentUsageSink } from './db-agent-usage-sink.js';
import type { IAgentUsageSink } from './agent-usage-sink.js';

const callOpenAiChat = vi.hoisted(() => vi.fn());
vi.mock('./openai-chat-client.js', () => ({ callOpenAiChat }));

const makeSink = (): IAgentUsageSink & {
  beforeCall: ReturnType<typeof vi.fn>;
  afterCall: ReturnType<typeof vi.fn>;
} => ({ afterCall: vi.fn(() => Promise.resolve()), beforeCall: vi.fn(() => Promise.resolve()) });

const body = { messages: [], system: 's', tools: [] };

describe('AgentChatService usage sink', () => {
  const projectsService = { getOwnedProject: vi.fn(() => Promise.resolve({})) } as unknown as ProjectsService;
  const agentSettings = {
    resolve: vi.fn(() => Promise.resolve({ apiKey: 'k', baseUrl: 'https://x', model: 'm1' })),
  } as unknown as AgentSettingsService;
  const config = { get: vi.fn() } as unknown as ConfigService;

  beforeEach(() => {
    callOpenAiChat.mockReset();
    callOpenAiChat.mockResolvedValue({
      text: 'hi',
      toolCalls: [],
      usage: { completionTokens: 1, promptTokens: 2, totalTokens: 3 },
    });
  });

  it('uses a provided AGENT_USAGE_SINK instead of the community default', async () => {
    const custom = makeSink();
    const fallback = makeSink();
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      config,
      fallback as unknown as DbAgentUsageSink,
      custom,
    );

    await service.chat('p1', 'u1', body as never);

    expect(custom.beforeCall).toHaveBeenCalledWith({ model: 'm1', projectId: 'p1', userId: 'u1' });
    expect(custom.afterCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm1', usage: { completionTokens: 1, promptTokens: 2, totalTokens: 3 } }),
    );
    expect(fallback.beforeCall).not.toHaveBeenCalled();
    expect(fallback.afterCall).not.toHaveBeenCalled();
  });

  it('falls back to the community default when nothing is provided', async () => {
    const fallback = makeSink();
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      config,
      fallback as unknown as DbAgentUsageSink,
    );

    await service.chat('p1', 'u1', body as never);

    expect(fallback.beforeCall).toHaveBeenCalledTimes(1);
    expect(fallback.afterCall).toHaveBeenCalledTimes(1);
  });

  it('propagates a beforeCall exception unchanged and skips the vendor call', async () => {
    const custom = makeSink();
    const denied = new HttpException('no credits', 402);
    custom.beforeCall.mockRejectedValue(denied);
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      config,
      makeSink() as unknown as DbAgentUsageSink,
      custom,
    );

    await expect(service.chat('p1', 'u1', body as never)).rejects.toBe(denied);
    expect(callOpenAiChat).not.toHaveBeenCalled();
  });

  it('swallows afterCall errors', async () => {
    const custom = makeSink();
    custom.afterCall.mockRejectedValue(new Error('db down'));
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      config,
      makeSink() as unknown as DbAgentUsageSink,
      custom,
    );

    await expect(service.chat('p1', 'u1', body as never)).resolves.toMatchObject({ text: 'hi' });
  });

  it('reports usage: null to afterCall when the vendor sent none', async () => {
    callOpenAiChat.mockResolvedValue({ text: 'hi', toolCalls: [] });
    const custom = makeSink();
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      config,
      makeSink() as unknown as DbAgentUsageSink,
      custom,
    );

    await service.chat('p1', 'u1', body as never);

    expect(custom.afterCall).toHaveBeenCalledWith(expect.objectContaining({ usage: null }));
  });

  const metricValue = async (line: string): Promise<number> => {
    const text = await metricsRegistry.render();
    const found = text.split('\n').find((row) => row.startsWith(`${line} `));
    return found ? Number(found.slice(line.length + 1)) : 0;
  };
  const vendorErrors = (): Promise<number> => metricValue('falang_agent_chat_calls_total{result="vendor_error"}');

  const makeService = (custom: ReturnType<typeof makeSink>) =>
    new AgentChatService(projectsService, agentSettings, config, makeSink() as unknown as DbAgentUsageSink, custom);

  it('turns an AgentChatVendorError into a 502 with the reason, counts it and skips afterCall', async () => {
    callOpenAiChat.mockRejectedValue(new AgentChatVendorError('vendor said no: ETIMEDOUT', 3));
    const custom = makeSink();
    const before = await vendorErrors();

    const caught = await makeService(custom)
      .chat('p1', 'u1', body as never)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BadGatewayException);
    expect((caught as BadGatewayException).getStatus()).toBe(502);
    expect((caught as BadGatewayException).message).toBe('vendor said no: ETIMEDOUT');
    expect(custom.beforeCall).toHaveBeenCalledTimes(1);
    expect(custom.afterCall).not.toHaveBeenCalled();
    expect(await vendorErrors()).toBe(before + 1);
  });

  it('lets a non-vendor error through unchanged and skips afterCall', async () => {
    const boom = new TypeError('bug');
    callOpenAiChat.mockRejectedValue(boom);
    const custom = makeSink();
    const before = await vendorErrors();

    await expect(makeService(custom).chat('p1', 'u1', body as never)).rejects.toBe(boom);

    expect(custom.afterCall).not.toHaveBeenCalled();
    expect(await vendorErrors()).toBe(before + 1);
  });

  it('answers 412 when the agent is not configured: no sink, no vendor call, counted as rejected', async () => {
    const unconfigured = { resolve: vi.fn(() => Promise.resolve(null)) } as unknown as AgentSettingsService;
    const custom = makeSink();
    const service = new AgentChatService(
      projectsService,
      unconfigured,
      config,
      makeSink() as unknown as DbAgentUsageSink,
      custom,
    );
    const before = await metricValue('falang_agent_chat_calls_total{result="rejected"}');

    await expect(service.chat('p1', 'u1', body as never)).rejects.toBeInstanceOf(PreconditionFailedException);

    expect(custom.beforeCall).not.toHaveBeenCalled();
    expect(callOpenAiChat).not.toHaveBeenCalled();
    expect(await metricValue('falang_agent_chat_calls_total{result="rejected"}')).toBe(before + 1);
  });

  it.each([
    ['0', 180_000],
    ['abc', 180_000],
    ['-5', 180_000],
    ['1234', 1234],
  ])('AGENT_CHAT_TIMEOUT_MS=%s gives a %i ms vendor timeout', async (value, expected) => {
    const cfg = {
      get: vi.fn((key: string) => (key === 'AGENT_CHAT_TIMEOUT_MS' ? value : '')),
    } as unknown as ConfigService;
    const service = new AgentChatService(
      projectsService,
      agentSettings,
      cfg,
      makeSink() as unknown as DbAgentUsageSink,
    );

    await service.chat('p1', 'u1', body as never);

    expect(callOpenAiChat).toHaveBeenCalledWith(
      expect.objectContaining({ transport: expect.objectContaining({ timeoutMs: expected }) }),
    );
  });
});

describe('AgentChatService limits (P1-2)', () => {
  const projectsService = { getOwnedProject: vi.fn(() => Promise.resolve({})) } as unknown as ProjectsService;
  const agentSettings = {
    resolve: vi.fn(() => Promise.resolve({ apiKey: 'k', baseUrl: 'https://x', model: 'm1' })),
  } as unknown as AgentSettingsService;
  const env = (values: Record<string, string>): ConfigService =>
    ({ get: vi.fn((key: string) => values[key]) }) as unknown as ConfigService;
  const make = (sink: ReturnType<typeof makeSink>, values: Record<string, string> = {}) =>
    new AgentChatService(projectsService, agentSettings, env(values), makeSink() as unknown as DbAgentUsageSink, sink);

  beforeEach(() => {
    callOpenAiChat.mockReset();
    callOpenAiChat.mockResolvedValue({ text: 'hi', toolCalls: [] });
  });

  it('rejects an oversized request with 400 before the sink and the vendor', async () => {
    const sink = makeSink();
    const huge = { messages: [{ content: 'x'.repeat(400_001), role: 'user' }], system: 's', tools: [] };

    const error = await make(sink)
      .chat('p1', 'u1', huge as never)
      .catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('message #1');
    expect(sink.beforeCall).not.toHaveBeenCalled();
    expect(callOpenAiChat).not.toHaveBeenCalled();
  });

  it('rejects when the whole request is too large', async () => {
    const part = 'x'.repeat(300_000);
    const messages = Array.from({ length: 6 }, () => ({ content: part, role: 'user' }));

    await expect(make(makeSink()).chat('p1', 'u1', { messages, system: 's', tools: [] } as never)).rejects.toThrow(
      /the request is/,
    );
  });

  it('answers 429 agent_busy for a third parallel call and frees slots after errors', async () => {
    const finishers: (() => void)[] = [];
    const rejecters: (() => void)[] = [];
    callOpenAiChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishers.push(() => resolve({ text: 'a', toolCalls: [] }));
        }),
    );
    callOpenAiChat.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejecters.push(() => reject(new AgentChatVendorError('down', 1)));
        }),
    );
    const service = make(makeSink(), { AGENT_CHAT_MAX_CONCURRENT_PER_USER: '2' });

    const first = service.chat('p1', 'u1', body as never);
    const second = service.chat('p1', 'u1', body as never).catch((error_: unknown) => error_);
    await vi.waitFor(() => expect(callOpenAiChat).toHaveBeenCalledTimes(2));
    const third = await service.chat('p1', 'u1', body as never).catch((error_: unknown) => error_);
    expect(third).toBeInstanceOf(HttpException);
    expect((third as HttpException).getStatus()).toBe(429);
    expect(((third as HttpException).getResponse() as { code: string }).code).toBe('agent_busy');
    // another user is unaffected
    callOpenAiChat.mockResolvedValueOnce({ text: 'b', toolCalls: [] });
    await expect(service.chat('p1', 'u2', body as never)).resolves.toMatchObject({ text: 'b' });

    finishers[0]?.();
    rejecters[0]?.();
    await first;
    expect(await second).toBeInstanceOf(BadGatewayException);
    // both released (one success, one failure): two more calls fit again
    callOpenAiChat.mockResolvedValue({ text: 'c', toolCalls: [] });
    await expect(service.chat('p1', 'u1', body as never)).resolves.toBeDefined();
    await expect(service.chat('p1', 'u1', body as never)).resolves.toBeDefined();
  });

  it('answers 503 when the process-wide cap is reached and releases on a beforeCall refusal', async () => {
    const sink = makeSink();
    sink.beforeCall.mockRejectedValueOnce(new HttpException('no credits', 402));
    const service = make(sink, { AGENT_CHAT_MAX_CONCURRENT: '1' });

    await expect(service.chat('p1', 'u1', body as never)).rejects.toThrow('no credits');
    // slot was released by the refusal
    await expect(service.chat('p1', 'u1', body as never)).resolves.toBeDefined();

    let finish!: () => void;
    callOpenAiChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ text: 'a', toolCalls: [] });
        }),
    );
    const running = service.chat('p1', 'u1', body as never);
    await vi.waitFor(() => expect(callOpenAiChat).toHaveBeenCalledTimes(2));
    const other = await service.chat('p1', 'u2', body as never).catch((error_: unknown) => error_);
    expect((other as HttpException).getStatus()).toBe(503);
    finish();
    await running;
  });

  it('passes max-tokens settings and a beforeRetry that re-runs the sink check', async () => {
    const sink = makeSink();
    await make(sink, { AGENT_CHAT_MAX_TOKENS: '1000', AGENT_CHAT_MAX_TOKENS_PARAM: 'max_completion_tokens' }).chat(
      'p1',
      'u1',
      body as never,
    );
    const args = callOpenAiChat.mock.calls[0]?.[0] as {
      maxTokens: number;
      maxTokensParam: string;
      transport: { beforeRetry: (n: number) => Promise<void>; totalTimeoutMs: number };
    };
    expect(args.maxTokens).toBe(1000);
    expect(args.maxTokensParam).toBe('max_completion_tokens');
    expect(args.transport.totalTimeoutMs).toBe(300_000);
    expect(sink.beforeCall).toHaveBeenCalledTimes(1);
    await args.transport.beforeRetry(2);
    expect(sink.beforeCall).toHaveBeenCalledTimes(2);
    sink.beforeCall.mockRejectedValueOnce(new HttpException('broke', 402));
    await expect(args.transport.beforeRetry(3)).rejects.toThrow('broke');
  });

  it('defaults max tokens to 8192 and 0 disables it', async () => {
    await make(makeSink()).chat('p1', 'u1', body as never);
    expect((callOpenAiChat.mock.calls[0]?.[0] as { maxTokens: number }).maxTokens).toBe(8192);
    await make(makeSink(), { AGENT_CHAT_MAX_TOKENS: '0' }).chat('p1', 'u1', body as never);
    expect((callOpenAiChat.mock.calls[1]?.[0] as { maxTokens: number }).maxTokens).toBe(0);
  });

  it('maps a total-timeout error to 504', async () => {
    callOpenAiChat.mockRejectedValue(new AgentChatVendorError('too slow', 2, null, true));
    const error = await make(makeSink())
      .chat('p1', 'u1', body as never)
      .catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(GatewayTimeoutException);
  });
});

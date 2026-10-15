import { BadGatewayException, HttpException, PreconditionFailedException } from '@nestjs/common';
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
    ['0', 600_000],
    ['abc', 600_000],
    ['-5', 600_000],
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

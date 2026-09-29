import express, { type Express } from 'express';
import { createOpenAiMockRouter, resetAllOpenAiMockState } from './openai-mock.js';
import { createTelegramMockRouter, resetAllTelegramMockState } from './telegram-mock.js';

export interface IMockContext {
  /** Registers a hook run whenever the service-wide reset (`POST /__mock__/reset`) fires. */
  readonly reset: (fn: () => void) => void;
}

/** One mock vendor: registers its routes on the app and, optionally, its reset hook. */
export type MockRegistration = (app: Express, ctx: IMockContext) => void;

const telegramMock: MockRegistration = (app, ctx) => {
  app.use(createTelegramMockRouter());
  ctx.reset(resetAllTelegramMockState);
};

const openAiMock: MockRegistration = (app, ctx) => {
  app.use(createOpenAiMockRouter());
  ctx.reset(resetAllOpenAiMockState);
};

/** The built-in mocks — registered through the exact same mechanism as extensions. */
export const BUILTIN_MOCKS: readonly MockRegistration[] = [telegramMock, openAiMock];

export interface ICreateMocksAppOptions {
  /** Extra mocks registered after the built-in ones (e.g. private vendors in a downstream repo). */
  readonly extraMocks?: readonly MockRegistration[];
}

/** Builds the combined mock app — one process standing in for several vendors, path-prefixed (`/telegram`, `/openai`, ...). */
export const createMocksApp = (options: ICreateMocksAppOptions = {}): Express => {
  const app = express();
  app.use(express.json());
  app.get('/', (_req, res) => res.json({ ok: true }));
  const resetHooks: (() => void)[] = [];
  const ctx: IMockContext = { reset: (fn) => resetHooks.push(fn) };
  for (const register of [...BUILTIN_MOCKS, ...(options.extraMocks ?? [])]) {
    register(app, ctx);
  }
  app.post('/__mock__/reset', (_req, res) => {
    for (const fn of resetHooks) {
      fn();
    }
    res.json({ ok: true });
  });
  return app;
};

/** Backwards-compatible alias of `createMocksApp()` with no extras. */
export const createApp = (): Express => createMocksApp();

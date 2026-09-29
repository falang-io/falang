import type { ILlmClient, ILlmCompleteParams, ILlmResponse } from './llm-client.js';

export type TScriptedStep =
  | ILlmResponse
  | ((params: ILlmCompleteParams, turn: number) => ILlmResponse | Promise<ILlmResponse>);

export class ScriptedLlmClient implements ILlmClient {
  readonly requests: ILlmCompleteParams[] = [];
  private readonly script: readonly TScriptedStep[];

  constructor(script: readonly TScriptedStep[]) {
    this.script = script;
  }

  async complete(params: ILlmCompleteParams): Promise<ILlmResponse> {
    const turn = this.requests.length;
    this.requests.push(params);
    const step = this.script[turn];
    if (!step) return { text: '', toolCalls: [] };
    return typeof step === 'function' ? await step(params, turn) : step;
  }
}

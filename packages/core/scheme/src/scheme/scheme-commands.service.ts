import { runInAction } from 'mobx';
import type { TCommandListenerPriority } from '../types/command-listener-priority.js';
import type { Scheme } from './scheme.js';
import logger from '../utils/logger.js';

// oxlint-disable-next-line no-unused-vars
export interface SchemeCommand<_TPayload> {
  type?: string;
}

export type CommandListener<P> = (payload: P, scheme: Scheme) => boolean;

type Commands = Map<SchemeCommand<unknown>, Set<CommandListener<unknown>>[]>;

export type CommandPayloadType<TCommand extends SchemeCommand<unknown>> =
  TCommand extends SchemeCommand<infer TPayload> ? TPayload : never;

export class SchemeCommandsService {
  private readonly _commands: Commands = new Map();
  private readonly scheme: Scheme;

  constructor(scheme: Scheme) {
    this.scheme = scheme;
  }

  registerCommand<P>(
    command: SchemeCommand<P>,
    listener: CommandListener<P>,
    priority: TCommandListenerPriority = 0,
  ): () => void {
    const commandsMap = this._commands;

    if (!commandsMap.has(command)) {
      commandsMap.set(command, [new Set(), new Set(), new Set(), new Set(), new Set()]);
    }

    const listenersInPriorityOrder = commandsMap.get(command);

    if (!listenersInPriorityOrder) {
      throw new Error(`registerCommand: Command ${command} not found in command map`);
    }

    const listeners = listenersInPriorityOrder[priority];
    listeners.add(listener as CommandListener<unknown>);
    return () => {
      listeners.delete(listener as CommandListener<unknown>);

      if (listenersInPriorityOrder.every((listenersSet) => listenersSet.size === 0)) {
        commandsMap.delete(command);
      }
    };
  }

  dispatchCommand<TCommand extends SchemeCommand<unknown>>(
    type: TCommand,
    payload: CommandPayloadType<TCommand>,
  ): boolean {
    if (!type.type?.includes('MOUSE')) {
      logger.debug(`Command fired: ${type.type}`, payload);
    }
    for (let i = 4; i >= 0; i -= 1) {
      const commandListeners = this._commands;
      const listenerInPriorityOrder = commandListeners.get(type);
      if (!listenerInPriorityOrder) continue;
      const listenersSet = listenerInPriorityOrder[i];
      if (!listenersSet || listenersSet.size === 0) continue;
      const listeners = [...listenersSet];
      const listenersLength = listeners.length;

      for (let j = 0; j < listenersLength; j += 1) {
        if (runInAction(() => listeners[j](payload, this.scheme))) {
          return true;
        }
      }
    }

    return false;
  }

  dispose() {
    this._commands.clear();
  }
}

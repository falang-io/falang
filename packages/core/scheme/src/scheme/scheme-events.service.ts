import { runInAction } from 'mobx';
import type { Scheme } from './scheme.js';
import logger from '../utils/logger.js';
import {
  EVENT_DATA_UPDATED,
  EVENT_META_UPDATED,
  EVENT_MODE_CHANGED,
  EVENT_NODE_DELETED,
  EVENT_NODE_INSERTED,
  EVENT_NODES_MOVED,
  EVENT_ONCHANGE,
  EVENT_OUT_UPDATED,
} from './scheme-events.js';

// oxlint-disable-next-line no-unused-vars
export interface SchemeEvent<_TPayload> {
  type: string;
}

const onChangeEvents = new Set<string>([
  EVENT_NODE_DELETED.type,
  EVENT_NODE_INSERTED.type,
  EVENT_NODES_MOVED.type,
  EVENT_DATA_UPDATED.type,
  // A meta-only edit (block width, if/while direction, a magic node's flags) must reach autosave too.
  EVENT_META_UPDATED.type,
  EVENT_OUT_UPDATED.type,
  EVENT_MODE_CHANGED.type,
]);

export type EventListener<P> = (payload: P, scheme: Scheme) => boolean;

type Events = Map<SchemeEvent<unknown>, Set<EventListener<unknown>>>;

export type EventPayloadType<TEvent extends SchemeEvent<unknown>> =
  TEvent extends SchemeEvent<infer TPayload> ? TPayload : never;

export class SchemeEventsService {
  private readonly _events: Events = new Map();
  private readonly scheme: Scheme;

  constructor(scheme: Scheme) {
    this.scheme = scheme;
  }

  subscribeEvent<P>(event: SchemeEvent<P>, listener: EventListener<P>): () => void {
    const eventsMap = this._events;

    if (!eventsMap.has(event)) {
      eventsMap.set(event, new Set());
    }

    const listeners = eventsMap.get(event);

    if (!listeners) {
      throw new Error(`registerEvent: Event ${event} not found in event map`);
    }

    listeners.add(listener as EventListener<unknown>);
    return () => {
      listeners.delete(listener as EventListener<unknown>);
    };
  }

  fireEvent<TEvent extends SchemeEvent<unknown>>(type: TEvent, payload: EventPayloadType<TEvent>): boolean {
    logger.debug(`Event fired: ${type.type}`, payload);
    const eventListeners = this._events;
    const listenersSet = eventListeners.get(type);
    let returnVal = false;
    if (listenersSet) {
      const listeners = [...listenersSet];
      const listenersLength = listeners.length;

      for (let j = 0; j < listenersLength; j += 1) {
        // oxlint-disable-next-line max-depth
        if (runInAction(() => listeners[j](payload, this.scheme))) {
          returnVal = true;
          break;
        }
      }
    }
    if (onChangeEvents.has(type.type)) {
      this.fireEvent(EVENT_ONCHANGE, { event: type.type });
    }

    return returnVal;
  }

  dispose() {
    this._events.clear();
  }
}

/** Product events the client reports to an (optional) analytics handler. No PII in props: ids, flags, status strings. */
export type TTrackedEvent =
  | 'signup'
  | 'login'
  | 'project_created'
  | 'template_used'
  | 'run_started'
  | 'version_published'
  | 'agent_turn'
  | 'support_message_sent';

export type TTrackedEventProps = Record<string, string | number | boolean>;

/** Implemented by a hosting edition's entry (via `IClientExtensions.eventTracker`); the community client knows no vendor. */
export interface IEventTrackerHandler {
  track(event: TTrackedEvent, props?: TTrackedEventProps): void;
  identify?(userId: string): void;
}

/** Neutral event tracker: a no-op until a handler is set, and it never lets a handler failure reach product code. */
export class EventTracker {
  private handler: IEventTrackerHandler | null = null;

  setHandler(handler: IEventTrackerHandler | null): void {
    this.handler = handler;
  }

  track(event: TTrackedEvent, props?: TTrackedEventProps): void {
    try {
      this.handler?.track(event, props);
    } catch (error) {
      // oxlint-disable-next-line no-console -- a tracker failure must never reach product code
      console.warn('[event-tracker] track failed', error);
    }
  }

  identify(userId: string): void {
    try {
      this.handler?.identify?.(userId);
    } catch (error) {
      // oxlint-disable-next-line no-console -- a tracker failure must never reach product code
      console.warn('[event-tracker] identify failed', error);
    }
  }
}

export const eventTracker = new EventTracker();

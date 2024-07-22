import { runInAction } from 'mobx';

export type TCallback = () => void;

const SCHEDULE_TIMEOUT = 50;

export class SheduleCallbackStore {
  private timer: NodeJS.Timeout | null = null;
  private callbacks = new Set<TCallback>();

  add(cb: TCallback) {
    this.callbacks.add(cb);
    this.addTimer();    
  }

  private addTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => this.flush(), SCHEDULE_TIMEOUT);
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  flush() {
    runInAction(() => {
      this.callbacks.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.error(err);
        }
      });
    });
    this.callbacks.clear();
    this.clearTimer();
  }

  dispose() {
    this.callbacks.clear();
    this.clearTimer();
  }
}
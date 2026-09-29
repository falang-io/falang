import { action, makeObservable, observable } from 'mobx';
import type { Scheme } from '../scheme/scheme.js';
import type { ISchemeMode } from '../types/scheme-mode.js';
import { DEFAULT_MODES } from '../types/toolbar-icon.js';
import { EVENT_MODE_CHANGED } from '../scheme/scheme-events.js';

export class ModeStore {
  readonly scheme: Scheme;
  @observable private _mode: string = DEFAULT_MODES.START;
  private _modes: ISchemeMode[] = [];

  constructor(scheme: Scheme) {
    this.scheme = scheme;
    this.registerMode({
      icon: 'start',
      name: DEFAULT_MODES.START,
      priority: 0,
    });
    makeObservable(this);
  }

  get value() {
    return this._mode;
  }

  registerMode(mode: ISchemeMode) {
    this._modes.push(mode);
  }

  get modes(): readonly ISchemeMode[] {
    return this._modes;
  }

  @action setMode(mode: string) {
    const foundMode = this.modes.find((m) => m.name === mode);
    if (!foundMode) throw new Error(`Mode not found: ${mode}`);
    if (mode === this._mode) return;
    const oldMode = this._mode;
    this._mode = mode;
    this.scheme.events.fireEvent(EVENT_MODE_CHANGED, {
      oldMode,
      newMode: mode,
    });
  }

  initialize() {
    this._modes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }
}

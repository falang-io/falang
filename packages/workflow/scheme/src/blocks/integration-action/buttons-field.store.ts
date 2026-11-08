import { TemplateStringStore } from '@falang/typescript-scheme';
import {
  MAX_MESSAGE_BUTTONS,
  parseMessageButtons,
  serializeMessageButtons,
  type TMessageButtonKind,
} from '@falang/workflow-integrations-common';
import { action, computed, makeObservable, observable } from 'mobx';

export interface IButtonRow {
  /** Stable per editor session — React key and the Monaco model name suffix. */
  readonly key: number;
  readonly kind: TMessageButtonKind;
  readonly text: TemplateStringStore;
  readonly value: TemplateStringStore;
}

export interface IButtonsFieldStoreParams {
  /** The node id — part of every row's Monaco model name, like any other field of the node. */
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly getScopeCode: () => string;
}

/**
 * Editing state of one `buttons` field (see `@falang/workflow-integrations-common`'s `message-buttons.ts`): one row per
 * button with its kind and two template-string Monaco fields, caption and URL/command. A stored value that doesn't
 * parse is kept verbatim (`parseError`) until the user edits the list, so opening and closing the editor never loses it.
 */
export class ButtonsFieldStore {
  @observable.shallow rows: IButtonRow[] = [];
  @observable parseError: string | null = null;
  private untouchedRaw: string | null = null;
  private nextKey = 1;
  private readonly params: IButtonsFieldStoreParams;

  constructor(params: IButtonsFieldStoreParams) {
    this.params = params;
    makeObservable(this);
    const parsed = parseMessageButtons(params.value);
    if (typeof parsed.error === 'string') {
      this.parseError = parsed.error;
      this.untouchedRaw = params.value;
    }
    this.rows = parsed.buttons.map((button) => this.createRow(button.kind, button.text, button.value));
  }

  private createRow(kind: TMessageButtonKind, text: string, value: string): IButtonRow {
    const key = this.nextKey;
    this.nextKey += 1;
    const store = (part: string, initial: string): TemplateStringStore =>
      new TemplateStringStore({
        id: this.params.id,
        name: `${this.params.name}-${key}-${part}`,
        value: initial,
        getScopeCode: this.params.getScopeCode,
      });
    return { key, kind, text: store('text', text), value: store('value', value) };
  }

  @computed get canAdd(): boolean {
    return this.rows.length < MAX_MESSAGE_BUTTONS;
  }

  private touch(): void {
    this.untouchedRaw = null;
    this.parseError = null;
  }

  @action addRow(kind: TMessageButtonKind = 'url'): void {
    if (!this.canAdd) return;
    this.touch();
    this.rows = [...this.rows, this.createRow(kind, '', '')];
  }

  @action removeRow(key: number): void {
    const row = this.rows.find((candidate) => candidate.key === key);
    if (!row) return;
    this.touch();
    row.text.dispose();
    row.value.dispose();
    this.rows = this.rows.filter((candidate) => candidate !== row);
  }

  @action moveRow(key: number, delta: -1 | 1): void {
    const index = this.rows.findIndex((row) => row.key === key);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= this.rows.length) return;
    this.touch();
    const rows = [...this.rows];
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this.rows = rows;
  }

  @action setKind(key: number, kind: TMessageButtonKind): void {
    this.touch();
    this.rows = this.rows.map((row) => (row.key === key ? { ...row, kind } : row));
  }

  /** The stored field value: the serialized list, or the unparseable original while it is untouched. */
  get value(): string {
    if (this.untouchedRaw !== null) return this.untouchedRaw;
    return serializeMessageButtons(
      this.rows.map((row) => ({ kind: row.kind, text: row.text.value, value: row.value.value })),
    );
  }

  dispose(): void {
    for (const row of this.rows) {
      row.text.dispose();
      row.value.dispose();
    }
  }
}

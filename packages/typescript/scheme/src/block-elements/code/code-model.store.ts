import type { editor } from 'monaco-editor';
import type monaco from 'monaco-editor';
import { action, computed, makeObservable, observable } from 'mobx';
import type { TNumberComputed } from '@falang/scheme';
import { getMonaco } from '../../monaco/get-monaco.js';

// `setHiddenAreas` is an internal monaco API not present in the public `IStandaloneCodeEditor` typings.
interface IEditorWithHiddenAreas {
  setHiddenAreas(ranges: monaco.IRange[], source?: unknown, forceUpdate?: boolean): void;
}

export interface ICodeModelConstructorParams {
  id: string;
  name?: string;
  value?: string;
  /** Code prepended to the model and hidden from the user, e.g. scope variable declarations. */
  hiddenPrefix?: string;
  /**
   * Code appended after the value and hidden from the user, e.g. the closing backtick of a
   * template literal the value is wrapped in. Must start with `\n` (like `hiddenPrefix` must end
   * with one) so it occupies whole lines of its own — hidden areas can only hide entire lines.
   */
  hiddenSuffix?: string;
  /** When true, an empty value is not highlighted as an error even if the model has error markers. */
  allowEmpty?: boolean;
}

/**
 * Appended after `hiddenSuffix` on its own hidden line. Without it, a file with no `import`/`export`
 * is a TS global script, so `declare const`s from `hiddenPrefix` leak into the shared global scope
 * of the language service — two fields declaring the same scope variable name then collide with
 * "Cannot redeclare block-scoped variable". Forcing module detection scopes them per-file instead.
 */
const MODULE_MARKER = '\nexport {};';

export class CodeModelStore {
  readonly fileName: string;
  readonly model: editor.ITextModel;
  readonly monaco: typeof monaco;
  @observable value: string;
  @observable hiddenPrefix: string;
  @observable hiddenSuffix: string;
  readonly allowEmpty: boolean;
  /**
   * Whether the model currently has an error-severity marker anywhere in it — including on lines
   * hidden by `hiddenPrefix` (e.g. the forced-type assignment in arr-op), where a squiggle would
   * otherwise be invisible to the user. Drives the field's red outline (see CodeModelEditingComponent).
   */
  @observable private _hasErrors = false;
  @observable private _width: TNumberComputed = () => 0;
  editor: editor.IStandaloneCodeEditor | null = null;
  private readonly markersDisposable: monaco.IDisposable;

  constructor({ id, name, value, hiddenPrefix, hiddenSuffix, allowEmpty }: ICodeModelConstructorParams) {
    this.fileName = `file:///${id}${name ? `-${name}` : ''}.ts`;
    this.value = value ?? '';
    this.hiddenPrefix = hiddenPrefix ?? '';
    this.hiddenSuffix = hiddenSuffix ?? '';
    this.allowEmpty = allowEmpty ?? false;
    const monaco = getMonaco();
    this.monaco = monaco;
    this.model = monaco.editor.createModel(this.fullValue, 'typescript', monaco.Uri.parse(this.fileName));
    makeObservable(this);
    this.markersDisposable = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((uri) => uri.toString() === this.model.uri.toString())) {
        this.updateHasErrors();
      }
    });
  }

  @action private updateHasErrors(): void {
    const markers = this.monaco.editor.getModelMarkers({ resource: this.model.uri });
    this._hasErrors = markers.some((marker) => marker.severity === this.monaco.MarkerSeverity.Error);
  }

  @computed get hasErrors(): boolean {
    if (this.allowEmpty && this.value.trim() === '') return false;
    return this._hasErrors;
  }

  @computed get fullValue(): string {
    return `${this.hiddenPrefix}${this.value}${this.effectiveHiddenSuffix}`;
  }

  /** `hiddenSuffix` plus the trailing `MODULE_MARKER`. */
  @computed private get effectiveHiddenSuffix(): string {
    return `${this.hiddenSuffix}${MODULE_MARKER}`;
  }

  /** Number of leading lines occupied by `hiddenPrefix`, i.e. the lines to hide in the editor. */
  @computed get hiddenLineCount(): number {
    return this.hiddenPrefix === '' ? 0 : this.hiddenPrefix.split('\n').length - 1;
  }

  /** Number of trailing lines occupied by `hiddenSuffix` (plus `MODULE_MARKER`), i.e. the lines to hide at the end of the editor. */
  @computed get hiddenSuffixLineCount(): number {
    return this.effectiveHiddenSuffix.split('\n').length - 1;
  }

  dispose(): void {
    this.markersDisposable.dispose();
    this.model.dispose();
    this._width = () => 0;
  }

  @action setValue(value: string): void {
    this.value = value;
    this.updateModel();
  }

  @action setHiddenPrefix(hiddenPrefix: string): void {
    if (this.hiddenPrefix === hiddenPrefix) return;
    this.hiddenPrefix = hiddenPrefix;
    this.updateModel();
  }

  @action setHiddenSuffix(hiddenSuffix: string): void {
    if (this.hiddenSuffix === hiddenSuffix) return;
    this.hiddenSuffix = hiddenSuffix;
    this.updateModel();
  }

  @action updateValue(): void {
    const lines = this.model.getValue().split('\n');
    this.value = lines.slice(this.hiddenLineCount, lines.length - this.hiddenSuffixLineCount).join('\n');
    // Any content change — not just ones routed through `setValue`/`setHiddenPrefix` below — can
    // touch the hidden-prefix/suffix lines too, e.g. monaco's own in-editor undo (Ctrl+Z) restoring
    // text that was previously replaced by a select-all edit. Reassert the hidden ranges every time
    // so they can't end up rendered as plain visible text.
    this.applyHiddenAreas();
  }

  @action updateModel(): void {
    this.model.setValue(this.fullValue);
    this.applyHiddenAreas();
  }

  setEditor(editorInstance: editor.IStandaloneCodeEditor | null): void {
    this.editor = editorInstance;
    this.applyHiddenAreas();
  }

  private applyHiddenAreas(): void {
    if (!this.editor) return;
    const ranges: monaco.IRange[] = [];
    if (this.hiddenLineCount > 0) {
      ranges.push(new this.monaco.Range(1, 1, this.hiddenLineCount, 1));
    }
    if (this.hiddenSuffixLineCount > 0) {
      const totalLines = this.model.getLineCount();
      ranges.push(new this.monaco.Range(totalLines - this.hiddenSuffixLineCount + 1, 1, totalLines, 1));
    }
    // `forceUpdate: true` — monaco skips reapplying hidden areas whose *line ranges* are unchanged
    // from last time, even though `model.setValue()` just replaced the underlying text and reset
    // the view's hidden-area rendering. Without this, a hiddenPrefix/hiddenSuffix that keeps the
    // same line count across an update (e.g. only the declared type changed, not the line count)
    // leaves the "hidden" lines visibly rendered after the model update.
    (this.editor as unknown as IEditorWithHiddenAreas).setHiddenAreas(ranges, null, true);
  }

  @action setWidth(value: TNumberComputed): void {
    this._width = value;
  }

  @computed get width(): number {
    return this._width();
  }
}

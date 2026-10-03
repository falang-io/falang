import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { arrPushDto } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable, reaction } from 'mobx';
import {
  ARRAY_TYPE_ALIAS_DECL,
  ARRAY_UNKNOWN_TYPE_EXPRESSION,
  buildArrayElementTypeExpression,
} from '@falang/typescript-common';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { TemplateStringStore } from '../../block-elements/template-string/template-string.store.js';
import {
  expressionToTextValue,
  textValueToExpression,
} from '../../block-elements/template-string/string-value-expression.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { probeIsStringType } from '../../monaco/scope/probe-string-type.js';
import { buildTypedValueHiddenPrefix } from '../../monaco/scope/typed-value-hidden-prefix.js';

export type IArrOpInput = zod.infer<typeof arrPushDto>;

/** Delay before re-asking the language service about the element type while `arr` is being typed. */
const ELEMENT_TYPE_PROBE_DELAY_MS = 300;

/**
 * Editor for array operations that require a value to insert into an array (arr-push, arr-unshift).
 * When the array's element type resolves to `string`, the value is edited as text with `${expr}`
 * interpolations (the same editor as text fields elsewhere) and stored back as a string/template literal
 * expression; otherwise — or while the type can't be resolved — it stays a plain expression field.
 */
export class ArrOpInputBlockEditorStore extends ExpressionBlockEditorStore<IArrOpInput> {
  readonly arrCodeStore: CodeModelStore;
  readonly valueCodeStore: CodeModelStore;
  @observable.ref valueTextStore: TemplateStringStore | null = null;
  private readonly iconId: string;
  private probeSequence = 0;
  private readonly disposeProbe: () => void;

  constructor(params: IBlockEditorFactoryParams<IArrOpInput>) {
    super(params);
    makeObservable(this);
    this.iconId = params.icon.id;
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.arrHiddenPrefix,
    });
    this.valueCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'value',
      value: params.data.value,
      hiddenPrefix: this.valueHiddenPrefix,
    });
    this.disposeProbe = reaction(
      () => [this.arrCodeStore.value, this.hiddenScopeCode] as const,
      () => {
        this.probeElementType().catch(() => {
          // `probeIsStringType` never rejects — unreachable, only here to avoid a floating promise.
        });
      },
      { fireImmediately: true, delay: ELEMENT_TYPE_PROBE_DELAY_MS },
    );
  }

  @computed get arrHiddenPrefix(): string {
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode + ARRAY_TYPE_ALIAS_DECL, ARRAY_UNKNOWN_TYPE_EXPRESSION);
  }

  /** Types the value field as the `arr` field's element type, inferred from whatever's currently typed there. */
  @computed get valueHiddenPrefix(): string {
    const elementType = buildArrayElementTypeExpression(this.arrCodeStore.value);
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode, elementType);
  }

  /** Whether the value is currently edited as text (the array holds strings). */
  @computed get isTextValue(): boolean {
    return this.valueTextStore !== null;
  }

  private async probeElementType(): Promise<void> {
    this.probeSequence += 1;
    const sequence = this.probeSequence;
    const elementType = buildArrayElementTypeExpression(this.arrCodeStore.value);
    const isString = elementType === 'unknown' ? false : await probeIsStringType(this.hiddenScopeCode, elementType);
    if (sequence !== this.probeSequence || isString === null) return;
    if (isString) this.switchToText();
    else this.switchToExpression();
  }

  @action private switchToText(): void {
    if (this.valueTextStore) return;
    this.valueTextStore = new TemplateStringStore({
      id: this.iconId,
      name: 'value-text',
      value: expressionToTextValue(this.valueCodeStore.value),
      getScopeCode: () => this.hiddenScopeCode,
    });
  }

  @action private switchToExpression(): void {
    const textStore = this.valueTextStore;
    if (!textStore) return;
    this.valueCodeStore.setValue(textValueToExpression(textStore.value));
    this.valueTextStore = null;
    textStore.dispose();
  }

  get valueExpression(): string {
    return this.valueTextStore ? textValueToExpression(this.valueTextStore.value) : this.valueCodeStore.value;
  }

  getData(): IArrOpInput {
    return { arr: this.arrCodeStore.value, value: this.valueExpression };
  }

  override dispose() {
    this.probeSequence += 1;
    this.disposeProbe();
    this.arrCodeStore.dispose();
    this.valueCodeStore.dispose();
    this.valueTextStore?.dispose();
  }
}

import type { TVariableInfo } from '@falang/typescript-dto';
import { action, makeObservable, observable, reaction, type IReactionDisposer } from 'mobx';
import { CodeModelStore } from '../code/code-model.store.js';

export interface ITypedFieldDescriptor {
  /** Stable identity across re-syncs (e.g. a function parameter's name) — used to preserve/dispose the matching `CodeModelStore`. */
  readonly key: string;
  readonly label: string;
  readonly type: TVariableInfo;
}

export interface ITypedField {
  readonly descriptor: ITypedFieldDescriptor;
  readonly store: CodeModelStore;
}

export interface IDynamicTypedFieldsStoreParams {
  id: string;
  /** Read reactively (inside a MobX `reaction`) — fields are created/disposed to match every time this changes. */
  getFields: () => readonly ITypedFieldDescriptor[];
  /** Seeds the fields present on the very first sync, matched positionally. Fields added later start empty. */
  initialValues: readonly string[];
  /** Builds the hidden monaco preamble that type-checks a field's expression against its declared type. */
  buildHiddenPrefix: (fieldType: TVariableInfo) => string;
}

/**
 * Manages a dynamic, reactively-sized list of typed `CodeModelStore` fields — e.g. `call-function`'s
 * parameters, whose count and types depend on whichever function is currently targeted and must
 * update live as that function's signature changes. Fields are matched across re-syncs by
 * `descriptor.key`: existing stores are kept (with their `hiddenPrefix` refreshed) and their value
 * preserved, stores for removed keys are disposed, and new keys get a fresh empty field.
 */
export class DynamicTypedFieldsStore {
  @observable.ref fields: readonly ITypedField[] = [];

  private readonly id: string;
  private readonly buildHiddenPrefix: (fieldType: TVariableInfo) => string;
  private readonly storesByKey = new Map<string, CodeModelStore>();
  private readonly stopSync: IReactionDisposer;
  private hasSeeded = false;

  constructor({ id, getFields, initialValues, buildHiddenPrefix }: IDynamicTypedFieldsStoreParams) {
    this.id = id;
    this.buildHiddenPrefix = buildHiddenPrefix;
    makeObservable(this);
    this.stopSync = reaction(getFields, (descriptors) => this.sync(descriptors, initialValues), {
      fireImmediately: true,
    });
  }

  @action private sync(descriptors: readonly ITypedFieldDescriptor[], initialValues: readonly string[]): void {
    const seedValues = this.hasSeeded ? null : initialValues;
    this.hasSeeded = true;

    const nextKeys = new Set(descriptors.map((descriptor) => descriptor.key));
    this.storesByKey.forEach((store, key) => {
      if (!nextKeys.has(key)) {
        store.dispose();
        this.storesByKey.delete(key);
      }
    });

    this.fields = descriptors.map((descriptor, index) => {
      const hiddenPrefix = this.buildHiddenPrefix(descriptor.type);
      let store = this.storesByKey.get(descriptor.key);
      if (store) {
        store.setHiddenPrefix(hiddenPrefix);
      } else {
        store = new CodeModelStore({
          id: this.id,
          name: descriptor.key,
          value: seedValues?.[index] ?? '',
          hiddenPrefix,
        });
        this.storesByKey.set(descriptor.key, store);
      }
      return { descriptor, store };
    });
  }

  getValues(): readonly string[] {
    return this.fields.map(({ store }) => store.value);
  }

  dispose(): void {
    this.stopSync();
    this.storesByKey.forEach((store) => store.dispose());
    this.storesByKey.clear();
  }
}

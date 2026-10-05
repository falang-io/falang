import type React from 'react';
import { resolveService } from '@falang/di';
import type { IBlockConfig, IBlockEditorFactoryParams, IBlockView, TBlockEditorView } from '@falang/scheme';
import { CELL_SIZE_2, EditorType, getGlobalI18n, useService } from '@falang/scheme';
import {
  collectScopeVariables,
  ExpressionBlockEditorStore,
  ExpressionEditorCellComponent,
  NewVariableEditingComponent,
  NewVariableStore,
  TemplateStringStore,
  TemplateStringViewComponent,
  TsSelect,
  TypeScriptBlockContainer,
} from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { action, observable, makeObservable } from 'mobx';
import type { IDriverActionDescriptor, IDriverFieldDescriptor } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { TOKEN_DRIVER_REGISTRY } from './driver-registry-token.js';
import type { DriverRegistryStore } from './driver-registry.store.js';

type TDriverActionData = Readonly<Record<string, string>>;

const fieldValueView = (field: IDriverFieldDescriptor, value = ''): React.ReactNode => {
  if (field.kind === 'pin') return `D${value}`;
  if (field.kind === 'string') return <TemplateStringViewComponent value={value} />;
  if (field.kind === 'select') return field.options?.find((option) => option.value === value)?.label ?? value;
  if (field.kind === 'new-variable') return value || <>&nbsp;</>;
  return value;
};

/** Shared by every `driver-action::…` node kind (see `driver-node-name.ts`) — the field list and code shape come from the node's own `IDriverActionDescriptor`, resolved by node name via `TOKEN_DRIVER_REGISTRY`, the same "one generic block, per-node descriptor lookup" shape `@falang/workflow-scheme`'s `IntegrationActionBlockComponent`/`IntegrationActionEditorStore` use for per-vendor action nodes. */
const DriverActionBlockComponent: IBlockView<TDriverActionData> = observer(({ data, icon }) => {
  const registry = useService(TOKEN_DRIVER_REGISTRY);
  // `language` is observable — reading it here re-renders the block when the UI language changes.
  const resolved = registry.localized(getGlobalI18n().language).findAction(icon.name);
  if (!resolved || !data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          {resolved.action.fields.map((field) => (
            <tr key={field.name}>
              <td>
                <div className="ts-label">{field.label}</div>
              </td>
              <td>
                <div className="ts-input-value">{fieldValueView(field, data[field.name])}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

class DriverActionBlockEditorStore extends ExpressionBlockEditorStore<TDriverActionData> {
  readonly driverAction: IDriverActionDescriptor;
  private readonly registry: DriverRegistryStore;
  private readonly nodeName: string;
  readonly values = observable.map<string, string>();
  readonly variableStore: NewVariableStore | undefined;
  /** One per "string"-kind field — lets the field's value contain a real, scope-checked `${expr}` interpolation, the same mechanism `@falang/typescript-scheme`'s `log` node uses (see ADR 0023 (private)'s driver actions ADR). */
  readonly templateStores = new Map<string, TemplateStringStore>();

  constructor(params: IBlockEditorFactoryParams<TDriverActionData>) {
    super(params);
    const registry = resolveService(TOKEN_DRIVER_REGISTRY, params.container);
    const resolved = registry.findAction(params.icon.name);
    if (!resolved) throw new Error(`No driver action registered for node "${params.icon.name}"`);
    this.driverAction = resolved.action;
    this.registry = registry;
    this.nodeName = params.icon.name;

    for (const field of this.driverAction.fields) {
      const value = params.data[field.name] ?? field.default ?? '';
      if (field.kind === 'new-variable') {
        this.variableStore = new NewVariableStore({
          value,
          getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
        });
      } else if (field.kind === 'string') {
        this.templateStores.set(
          field.name,
          new TemplateStringStore({
            id: `${params.icon.id}-${field.name}`,
            value,
            getScopeCode: () => this.hiddenScopeCode,
          }),
        );
      } else {
        this.values.set(field.name, value);
      }
    }
    makeObservable(this);
  }

  /** The action with labels/option labels in `language` — controls and stored values keep using the base `driverAction`. */
  localizedAction(language: string): IDriverActionDescriptor {
    return this.registry.localized(language).findAction(this.nodeName)?.action ?? this.driverAction;
  }

  @action setFieldValue(name: string, value: string): void {
    this.values.set(name, value);
  }

  getData(): TDriverActionData {
    const data: Record<string, string> = Object.fromEntries(this.values);
    for (const [name, store] of this.templateStores) data[name] = store.value;
    const newVariableField = this.driverAction.fields.find((field) => field.kind === 'new-variable');
    if (newVariableField && this.variableStore) data[newVariableField.name] = this.variableStore.value;
    return data;
  }

  override dispose(): void {
    for (const store of this.templateStores.values()) store.dispose();
  }
}

const FieldEditorControl: React.FC<{ field: IDriverFieldDescriptor; editor: DriverActionBlockEditorStore }> = observer(
  ({ field, editor }) => {
    if (field.kind === 'new-variable') {
      // Every action with a `new-variable` field gets one in its constructor — see the loop above.
      return <NewVariableEditingComponent store={editor.variableStore as NewVariableStore} autoFocus={false} />;
    }
    const value = editor.values.get(field.name) ?? '';
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      editor.setFieldValue(field.name, e.currentTarget.value);
    if (field.kind === 'select' || field.kind === 'boolean') {
      const options =
        field.kind === 'boolean'
          ? [
              { value: 'true', label: 'true' },
              { value: 'false', label: 'false' },
            ]
          : (field.options ?? []);
      return (
        <TsSelect value={value} onChange={onChange}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TsSelect>
      );
    }
    if (field.kind === 'string') {
      const store = editor.templateStores.get(field.name);
      // Every "string"-kind field gets one in the constructor — see the loop above.
      if (!store) return null;
      return (
        <ExpressionEditorCellComponent
          store={store.codeStore}
          hiddenPrefix={store.hiddenPrefix}
          hiddenSuffix={store.hiddenSuffix}
        />
      );
    }
    return (
      <input className="ts-input" type="number" min={field.min} max={field.max} value={value} onChange={onChange} />
    );
  },
);

const DriverActionBlockEditorComponent: TBlockEditorView<DriverActionBlockEditorStore> = observer(({ editor }) => (
  <TypeScriptBlockContainer>
    <table className="ts-table ts-table--fixed">
      <tbody>
        {editor.localizedAction(getGlobalI18n().language).fields.map((field) => (
          <tr key={field.name}>
            <td>
              <div className="ts-label">{field.label}</div>
            </td>
            <td>
              <FieldEditorControl field={field} editor={editor} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

export const driverActionBlockConfig = {
  view: DriverActionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: DriverActionBlockEditorComponent,
    editorFactory: (params) => new DriverActionBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<TDriverActionData>;

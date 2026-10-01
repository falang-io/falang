import type { IBlockConfig, IBlockEditorFactoryParams, IBlockView, TBlockEditorView } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import {
  collectScopeVariables,
  ExpressionBlockEditorStore,
  NewVariableEditingComponent,
  NewVariableStore,
  TypeScriptBlockContainer,
} from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { action, computed, makeObservable, observable } from 'mobx';
import type { IPinReadData } from '@falang/desktop-arduino-dto/src/pin-nodes.js';

const PinReadBlockComponent: IBlockView<IPinReadData> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">pin</div>
            </td>
            <td>
              <div className="ts-input-value">{data.pin}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">var</div>
            </td>
            <td>
              <div className="ts-input-value">{data.variable || <>&nbsp;</>}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

/**
 * Shared by both `pin-read-digital` and `pin-read-analog` — the editor UI is identical, only the
 * node *name* (which is what `lower-pin-nodes.ts` switches on) picks `digitalRead` vs `analogRead`.
 */
class PinReadBlockEditorStore extends ExpressionBlockEditorStore<IPinReadData> {
  @observable pin: number;
  readonly variableStore: NewVariableStore;

  constructor(params: IBlockEditorFactoryParams<IPinReadData>) {
    super(params);
    this.pin = params.data.pin;
    this.variableStore = new NewVariableStore({
      value: params.data.variable,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });
    makeObservable(this);
  }

  @action setPin(pin: number) {
    this.pin = pin;
  }

  @computed get data(): IPinReadData {
    return { pin: this.pin, variable: this.variableStore.value };
  }

  getData(): IPinReadData {
    return this.data;
  }
}

const PinReadBlockEditorComponent: TBlockEditorView<PinReadBlockEditorStore> = observer(({ editor }) => (
  <TypeScriptBlockContainer>
    <table className="ts-table ts-table--fixed">
      <tbody>
        <tr>
          <td>
            <div className="ts-label">pin</div>
          </td>
          <td>
            <input
              className="ts-input"
              type="number"
              min={0}
              value={editor.pin}
              onChange={(e) => editor.setPin(Number(e.currentTarget.value) || 0)}
            />
          </td>
        </tr>
        <tr>
          <td>
            <div className="ts-label">var</div>
          </td>
          <td>
            <NewVariableEditingComponent store={editor.variableStore} autoFocus={false} />
          </td>
        </tr>
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

export const pinReadBlockConfig = {
  view: PinReadBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: PinReadBlockEditorComponent,
    editorFactory: (params) => new PinReadBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IPinReadData>;

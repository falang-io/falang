import { tl } from '../locales/arduino-t.js';
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
import type { IRandomData } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';

const RandomBlockComponent: IBlockView<IRandomData> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">{tl('max')}</div>
            </td>
            <td>
              <div className="ts-input-value">{data.max}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">{tl('var')}</div>
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

class RandomBlockEditorStore extends ExpressionBlockEditorStore<IRandomData> {
  @observable max: number;
  readonly variableStore: NewVariableStore;

  constructor(params: IBlockEditorFactoryParams<IRandomData>) {
    super(params);
    this.max = params.data.max;
    this.variableStore = new NewVariableStore({
      value: params.data.variable,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });
    makeObservable(this);
  }

  @action setMax(max: number) {
    this.max = max;
  }

  @computed get data(): IRandomData {
    return { max: this.max, variable: this.variableStore.value };
  }

  getData(): IRandomData {
    return this.data;
  }
}

const RandomBlockEditorComponent: TBlockEditorView<RandomBlockEditorStore> = observer(({ editor }) => (
  <TypeScriptBlockContainer>
    <table className="ts-table ts-table--fixed">
      <tbody>
        <tr>
          <td>
            <div className="ts-label">{tl('max')}</div>
          </td>
          <td>
            <input
              className="ts-input"
              type="number"
              min={1}
              value={editor.max}
              onChange={(e) => editor.setMax(Number(e.currentTarget.value) || 1)}
            />
          </td>
        </tr>
        <tr>
          <td>
            <div className="ts-label">{tl('var')}</div>
          </td>
          <td>
            <NewVariableEditingComponent store={editor.variableStore} autoFocus={false} />
          </td>
        </tr>
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

export const randomBlockConfig = {
  view: RandomBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: RandomBlockEditorComponent,
    editorFactory: (params) => new RandomBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IRandomData>;

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
import { computed, makeObservable } from 'mobx';
import type { IZeroArgReadData } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';

/**
 * Shared block config for every Arduino built-in function that takes no arguments and returns a value
 * (`millis`/`micros`) — the editor UI is identical to `pin-read.block.tsx`'s shared digital/analog-read
 * component minus the pin field, since neither call takes one.
 */
const ZeroArgReadBlockComponent = (functionLabel: string): IBlockView<IZeroArgReadData> =>
  observer(({ data }) => {
    if (!data) return <div>&nbsp;</div>;
    return (
      <TypeScriptBlockContainer>
        <table className="ts-table">
          <tbody>
            <tr>
              <td>
                <div className="ts-label">{tl('call')}</div>
              </td>
              <td>
                <div className="ts-input-value">{functionLabel}</div>
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

class ZeroArgReadBlockEditorStore extends ExpressionBlockEditorStore<IZeroArgReadData> {
  readonly variableStore: NewVariableStore;

  constructor(params: IBlockEditorFactoryParams<IZeroArgReadData>) {
    super(params);
    this.variableStore = new NewVariableStore({
      value: params.data.variable,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });
    makeObservable(this);
  }

  @computed get data(): IZeroArgReadData {
    return { variable: this.variableStore.value };
  }

  getData(): IZeroArgReadData {
    return this.data;
  }
}

const ZeroArgReadBlockEditorComponent = (functionLabel: string): TBlockEditorView<ZeroArgReadBlockEditorStore> =>
  observer(({ editor }) => (
    <TypeScriptBlockContainer>
      <table className="ts-table ts-table--fixed">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">{tl('call')}</div>
            </td>
            <td>
              <div className="ts-input-value">{functionLabel}</div>
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

export const createZeroArgReadBlockConfig = (functionLabel: string) =>
  ({
    view: ZeroArgReadBlockComponent(functionLabel),
    minHeight: CELL_SIZE_2,
    editor: {
      view: ZeroArgReadBlockEditorComponent(functionLabel),
      editorFactory: (params) => new ZeroArgReadBlockEditorStore(params),
      type: EditorType.inline,
    },
  }) satisfies IBlockConfig<IZeroArgReadData>;

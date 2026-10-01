import type { IBlockConfig, IBlockEditorFactoryParams, IBlockView, TBlockEditorView } from '@falang/scheme';
import { BlockEditorStore, CELL_SIZE_2, EditorType } from '@falang/scheme';
import { TypeScriptBlockContainer } from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { action, observable, makeObservable } from 'mobx';
import type { ISingleNumberActionData } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';

/**
 * Shared block config for every Arduino built-in function that takes exactly one literal numeric
 * argument and returns nothing (`delay`/`delayMicroseconds`/`randomSeed`/`Serial.begin`/`Serial.print`/
 * `Serial.println`) — see ADR 0023 (private)'s pin-write nodes for the same "hardware-control
 * widget, not a generic code block" shape this mirrors. `lower-arduino-function-nodes.ts` switches on
 * the node *name* (not this shared data shape) to pick which builtin to call.
 */
export interface ISingleNumberActionBlockOptions {
  readonly label: string;
  readonly min?: number;
}

const SingleNumberActionBlockComponent = (label: string): IBlockView<ISingleNumberActionData> =>
  observer(({ data }) => {
    if (!data) return <div>&nbsp;</div>;
    return (
      <TypeScriptBlockContainer>
        <table className="ts-table">
          <tbody>
            <tr>
              <td>
                <div className="ts-label">{label}</div>
              </td>
              <td>
                <div className="ts-input-value">{data.value}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  });

class SingleNumberActionBlockEditorStore extends BlockEditorStore<ISingleNumberActionData> {
  @observable data: ISingleNumberActionData;

  constructor(params: IBlockEditorFactoryParams<ISingleNumberActionData>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  @action setValue(value: number) {
    this.data = { value };
  }

  getData(): ISingleNumberActionData {
    return this.data;
  }
}

const SingleNumberActionBlockEditorComponent = (
  label: string,
  min: number | undefined,
): TBlockEditorView<SingleNumberActionBlockEditorStore> =>
  observer(({ editor }) => (
    <TypeScriptBlockContainer>
      <table className="ts-table ts-table--fixed">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">{label}</div>
            </td>
            <td>
              <input
                className="ts-input"
                type="number"
                min={min}
                value={editor.data.value}
                onChange={(e) => editor.setValue(Number(e.currentTarget.value) || 0)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  ));

export const createSingleNumberActionBlockConfig = ({ label, min }: ISingleNumberActionBlockOptions) =>
  ({
    view: SingleNumberActionBlockComponent(label),
    minHeight: CELL_SIZE_2,
    editor: {
      view: SingleNumberActionBlockEditorComponent(label, min),
      editorFactory: (params) => new SingleNumberActionBlockEditorStore(params),
      type: EditorType.inline,
    },
  }) satisfies IBlockConfig<ISingleNumberActionData>;

import type { IBlockConfig, IBlockEditorFactoryParams, IBlockView, TBlockEditorView } from '@falang/scheme';
import { BlockEditorStore, CELL_SIZE_2, EditorType } from '@falang/scheme';
import { TypeScriptBlockContainer } from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { action, observable, makeObservable } from 'mobx';
import type { IPinWriteAnalogData } from '@falang/desktop-arduino-dto/src/pin-nodes.js';

const clampAnalogValue = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

const PinWriteAnalogBlockComponent: IBlockView<IPinWriteAnalogData> = observer(({ data }) => {
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
              <div className="ts-input-value">~{data.pin}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">value</div>
            </td>
            <td>
              <div className="ts-input-value">{data.value} / 255</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

class PinWriteAnalogBlockEditorStore extends BlockEditorStore<IPinWriteAnalogData> {
  @observable data: IPinWriteAnalogData;

  constructor(params: IBlockEditorFactoryParams<IPinWriteAnalogData>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  @action setPin(pin: number) {
    this.data = { ...this.data, pin };
  }

  @action setValue(value: number) {
    this.data = { ...this.data, value: clampAnalogValue(value) };
  }

  getData(): IPinWriteAnalogData {
    return this.data;
  }
}

const PinWriteAnalogBlockEditorComponent: TBlockEditorView<PinWriteAnalogBlockEditorStore> = observer(({ editor }) => (
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
              value={editor.data.pin}
              onChange={(e) => editor.setPin(Number(e.currentTarget.value) || 0)}
            />
          </td>
        </tr>
        <tr>
          <td>
            <div className="ts-label">value</div>
          </td>
          <td>
            <input
              className="ts-input"
              type="range"
              min={0}
              max={255}
              value={editor.data.value}
              onChange={(e) => editor.setValue(Number(e.currentTarget.value))}
            />
            <span>{editor.data.value}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

export const pinWriteAnalogBlockConfig = {
  view: PinWriteAnalogBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: PinWriteAnalogBlockEditorComponent,
    editorFactory: (params) => new PinWriteAnalogBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IPinWriteAnalogData>;

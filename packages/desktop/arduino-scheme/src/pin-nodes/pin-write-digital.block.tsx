import type React from 'react';
import type { IBlockConfig, IBlockEditorFactoryParams, IBlockView, TBlockEditorView } from '@falang/scheme';
import { BlockEditorStore, CELL_SIZE_2, EditorType } from '@falang/scheme';
import { TypeScriptBlockContainer, TsSelect } from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { action, observable, makeObservable } from 'mobx';
import type { IPinWriteDigitalData } from '@falang/desktop-arduino-dto/src/pin-nodes.js';

const PinStateDot: React.FC<{ value: boolean }> = ({ value }) => (
  <span
    style={{
      display: 'inline-block',
      width: 9,
      height: 9,
      borderRadius: '50%',
      marginRight: 5,
      background: value ? '#52c41a' : '#8c8c8c',
      boxShadow: value ? '0 0 4px #52c41a' : 'none',
    }}
  />
);

const PinWriteDigitalBlockComponent: IBlockView<IPinWriteDigitalData> = observer(({ data }) => {
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
              <div className="ts-input-value">D{data.pin}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">value</div>
            </td>
            <td>
              <div className="ts-input-value">
                <PinStateDot value={data.value} />
                {data.value ? 'HIGH' : 'LOW'}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

class PinWriteDigitalBlockEditorStore extends BlockEditorStore<IPinWriteDigitalData> {
  @observable data: IPinWriteDigitalData;

  constructor(params: IBlockEditorFactoryParams<IPinWriteDigitalData>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  @action setPin(pin: number) {
    this.data = { ...this.data, pin };
  }

  @action setValue(value: boolean) {
    this.data = { ...this.data, value };
  }

  getData(): IPinWriteDigitalData {
    return this.data;
  }
}

const PinWriteDigitalBlockEditorComponent: TBlockEditorView<PinWriteDigitalBlockEditorStore> = observer(
  ({ editor }) => (
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
              <TsSelect
                value={editor.data.value ? 'HIGH' : 'LOW'}
                onChange={(e) => editor.setValue(e.currentTarget.value === 'HIGH')}
              >
                <option value="HIGH">HIGH</option>
                <option value="LOW">LOW</option>
              </TsSelect>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  ),
);

export const pinWriteDigitalBlockConfig = {
  view: PinWriteDigitalBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: PinWriteDigitalBlockEditorComponent,
    editorFactory: (params) => new PinWriteDigitalBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IPinWriteDigitalData>;

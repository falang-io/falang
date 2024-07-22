import { all } from 'mathjs'
import { observer } from 'mobx-react'
import { SelectComponent } from '@falang/editor-scheme'
import { CELL_SIZE } from '@falang/editor-scheme'
import { TSelectOptionType } from '../constants'
import { IStructureTypeItem } from '../ILogicProjectType'
import { LogicProjectStore } from '../LogicProject.store'
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams'
import { DecimalOptionsComponent } from './DecimalOptions.cmp'
import { FloatIntegerOptionsComponent } from './FloatIntegerOptions.cmp'
import { GeneralTypeSelectComponent } from './GeneralTypeSelect.cmp'

export interface IInlineTypeSelectComponentParams extends IVariableTypeEditorComponentParams {
  enabledOptionTypes?: TSelectOptionType[]
  availableStructures?: IStructureTypeItem[]
  projectStore: LogicProjectStore,
}

export const InlineTypeSelectComponent: React.FC<IInlineTypeSelectComponentParams> = observer(({
  scheme,
  x,
  y,
  width,
  setVariableType,
  variableType,
  enabledOptionTypes,
  availableStructures,
  allowVoid,
  projectStore,
}) => {
  return <>
    <GeneralTypeSelectComponent
      setVariableType={(t) => {
        setVariableType(t);
      }}
      scheme={scheme}
      variableType={variableType}
      x={x}
      allowVoid={allowVoid}
      y={y}
      width={CELL_SIZE * 4}
      enabledOptionTypes={enabledOptionTypes}
      projectStore={projectStore}
    />
    {variableType?.type === 'number' && variableType.numberType === 'decimal'
      ? <DecimalOptionsComponent
        setVariableType={(t) => setVariableType(t)}
        scheme={scheme}
        variableType={variableType}
        x={x + CELL_SIZE * 4}
        y={y}
        width={width - CELL_SIZE * 4}
        projectStore={projectStore}
      /> : null}
    {variableType?.type === 'number' && variableType.numberType !== 'decimal' ? <>
      <FloatIntegerOptionsComponent
        x={x + CELL_SIZE * 4}
        y={y}
        width={width - CELL_SIZE * 4}
        setVariableType={(t) => setVariableType(t)}
        scheme={scheme}
        variableType={variableType}
        projectStore={projectStore}
      />
    </> : null}
    {(variableType?.type === 'struct' && availableStructures?.length) ? <SelectComponent
      height={CELL_SIZE}
      onChange={(value) => {
        const [schemeId, iconId] = String(value).split('###');
        const structure = availableStructures.find((s) => s.iconId === iconId && s.schemeId === schemeId)
        if (!structure) return;
        setVariableType({
          ...variableType,
          schemeId: structure.schemeId,
          iconId: structure.iconId,
          name: structure.name,
        });
      }}
      options={(availableStructures.map((s) => ({
        text: s.name,
        value: `${s.schemeId}###${s.iconId}`
      })))}
      scheme={scheme}
      value={`${variableType.schemeId}###${variableType.iconId}`}
      width={width - CELL_SIZE * 4}
      x={x + CELL_SIZE * 4}
      y={y}
    /> : null}
    {/*(variableType?.type === 'enum') ? <SelectComponent
      height={CELL_SIZE}
      onChange={(value) => {
        const [schemeId, iconId] = String(value).split('|||');
        const enm = projectStore.availableEnums.find((s) => s.iconId === iconId && s.schemeId === schemeId);
        if (!enm) return;
        setVariableType({
          ...variableType,
          schemeId: enm.schemeId,
          iconId: enm.iconId,
        });
      }}
      options={projectStore.availableEnumsOptions}
      scheme={scheme}
      value={`${variableType.schemeId}|||${variableType.iconId}`}
      width={width - CELL_SIZE * 4}
      x={x + CELL_SIZE * 4}
      y={y}
    /> : null*/}
  </>
});
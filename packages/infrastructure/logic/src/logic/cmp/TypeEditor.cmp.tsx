import { CELL_SIZE } from '@falang/editor-scheme';
import { TSelectOptionType } from '../constants';
import { IStructureTypeItem } from '../ILogicProjectType';
import { LogicProjectStore } from '../LogicProject.store';
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams';
import { InlineTypeSelectComponent } from './InlineTypeSelect.cmp';

export interface ITypeEditorComponentParams extends IVariableTypeEditorComponentParams {
  availableStructures: IStructureTypeItem[]
  projectStore: LogicProjectStore
}

export const TypeEditorComponent: React.FC<ITypeEditorComponentParams> = ({
  scheme,
  setVariableType,
  variableType,
  width,
  x,
  y,
  availableStructures,
  allowVoid,
  projectStore,
}) => {
  if(!variableType) return null;
  return <>
    <InlineTypeSelectComponent
      scheme={scheme}
      setVariableType={t => setVariableType(t)}
      variableType={variableType}
      width={width}
      x={x}
      y={y}
      allowVoid={allowVoid}
      availableStructures={availableStructures}
      projectStore={projectStore}
    />
    {variableType.type === 'array' ? <InlineTypeSelectComponent
      scheme={scheme}
      setVariableType={t => {
        setVariableType({
          ...variableType,
          elementType: t,
        })
      }}
      enabledOptionTypes={['boolean', 'decimal', 'float', 'integer', 'string', 'struct', 'enum']}
      variableType={variableType.elementType}
      width={width}
      x={x}
      y={y + CELL_SIZE}
      availableStructures={availableStructures}
      projectStore={projectStore}
    /> : null}
  </>;
}
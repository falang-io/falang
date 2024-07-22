import { observer } from 'mobx-react'
import { ProjectStore } from '@falang/editor-scheme'
import { LogicProjectStore } from '../LogicProject.store'
import { TypeEditorComponent } from './TypeEditor.cmp'
import { InlineTypeStore } from '../store/InlineType.store'

export interface ITypeEditor2ComponentParams {
  store: InlineTypeStore
  projectStore: LogicProjectStore
}

export const TypeEditor2Component: React.FC<ITypeEditor2ComponentParams> = observer(({ store, projectStore }) => {
  return <TypeEditorComponent 
    availableStructures={store.projectStore.availableStructures}
    scheme={store.scheme}
    setVariableType={(v) => store.set(v)}
    variableType={store.get()}
    width={store.shape.width}
    x={store.position.x}
    y={store.position.y}
    allowVoid={store.allowVoid}
    projectStore={projectStore}
  />
});

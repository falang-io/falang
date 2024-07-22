import { observer } from 'mobx-react';
import { LogicProjectStore } from '../LogicProject.store';
import { InlineTypeStore } from '../store/InlineType.store';
import { InlineTypeViewComponent } from './InlineTypeView.cmp';
import { TypeEditorComponent } from './TypeEditor.cmp';

interface IInlineType2EditorComponentParams {
  store: InlineTypeStore
}

export const InlineType2EditorComponent: React.FC<IInlineType2EditorComponentParams> = observer(({ store }) => {
  return <TypeEditorComponent 
    availableStructures={store.projectStore.availableStructures}
    scheme={store.scheme}
    setVariableType={(value) => store.set(value)}
    variableType={store.get()}
    width={store.shape.width}
    allowVoid={store.allowVoid}
    x={store.position.x}
    y={store.position.y}
    projectStore={store.projectStore}
  />;
});

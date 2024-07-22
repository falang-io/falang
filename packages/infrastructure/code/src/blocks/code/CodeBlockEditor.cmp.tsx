import { TBlockComponent } from '@falang/editor-scheme';
import { observer } from "mobx-react";
import { CodeEditorComponent } from '../../cmp/CodeEditor.cmp';
import { CodeBlockStore } from './CodeBlock.store';

export const CodeBlockEditorComponent: TBlockComponent<CodeBlockStore> = observer(({ block }) => {
  return <CodeEditorComponent store={block.codeStore} x={block.position.x} y={block.position.y} />
});

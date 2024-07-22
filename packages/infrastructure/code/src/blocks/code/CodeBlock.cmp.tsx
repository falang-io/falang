import { observer } from "mobx-react";
import React from 'react'
import { TBlockComponent } from '@falang/editor-scheme';
import { CodeComponent } from '../../cmp/Code.cmp';
import type { CodeBlockStore } from "./CodeBlock.store";

export const CodeBlockComponent: TBlockComponent<CodeBlockStore> = observer(({ block }) => {
  return <CodeComponent code={block.codeStore} x={block.position.x} y={block.position.y} />
});

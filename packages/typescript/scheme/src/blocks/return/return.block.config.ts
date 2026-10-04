import type { IBlockConfig, IBlockShapeConfig, IIconConfig } from '@falang/scheme';
import { BaseIconComponent, EditorType, rectangleShape } from '@falang/scheme';
import { ReturnBlockComponent, ReturnEditBlockComponent } from './return.block.cmp.js';
import { ReturnEditorStore } from './return-editor.store.js';
import { ReturnIconStore } from './return.icon.store.js';

export const returnBlockConfig = {
  view: ReturnBlockComponent,
  editor: {
    view: ReturnEditBlockComponent,
    editorFactory: (params) => new ReturnEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;

export const returnIconConfig = {
  factory: (params) => new ReturnIconStore(params),
  view: BaseIconComponent,
} as const satisfies IIconConfig<ReturnIconStore>;

/** No frame in a void function (like `break`/`continue`), the usual rectangle otherwise. */
export const returnShape: IBlockShapeConfig = {
  view: (props) =>
    props.icon instanceof ReturnIconStore && !props.icon.returnsValue ? null : rectangleShape.view(props),
};

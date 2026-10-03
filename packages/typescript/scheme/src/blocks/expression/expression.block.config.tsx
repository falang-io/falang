import type { IBlockConfig, IBlockView } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';
import { ActionEditBlockComponent } from '../action/action-edit.block.cmp.js';
import { decodeLegacyHtml } from './decode-legacy-html.js';
import { ExpressionEditorStore } from './expression-editor.store.js';

export const ExpressionBlockComponent: IBlockView<string> = observer(({ data }) => (
  <CodeViewComponent value={decodeLegacyHtml(data ?? '')} />
));

/** One TypeScript expression (`while` condition, `switch` subject/case, `return`/`throw` value). */
export const expressionBlockConfig = {
  view: ExpressionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ActionEditBlockComponent,
    editorFactory: (params) => new ExpressionEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;

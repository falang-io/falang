import type { IBlockView, TBlockEditorView } from '@falang/scheme';
import { getPseudoBlockComponent, TOKEN_I18N, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { decodeLegacyHtml } from '../expression/decode-legacy-html.js';
import type { ReturnEditorStore } from './return-editor.store.js';
import { ReturnIconStore } from './return.icon.store.js';

const VoidReturnView = getPseudoBlockComponent('icon:return');

const ReturnTitle: React.FC = () => {
  const t = useService(TOKEN_I18N).t;
  return <div className="ts-label">{t('icon:return')}</div>;
};

/** `break`/`continue`-like label in a void function, a titled expression otherwise. */
export const ReturnBlockComponent: IBlockView<string> = observer((props) => {
  const { data, icon } = props;
  if (icon instanceof ReturnIconStore && !icon.returnsValue) return <VoidReturnView {...props} />;
  return (
    <TypeScriptBlockContainer>
      <ReturnTitle />
      <CodeViewComponent value={decodeLegacyHtml(data ?? '')} />
    </TypeScriptBlockContainer>
  );
});

export const ReturnEditBlockComponent: TBlockEditorView<ReturnEditorStore> = observer(({ editor }) => (
  <TypeScriptBlockContainer>
    <ReturnTitle />
    <ExpressionEditorCellComponent store={editor.codeStore} hiddenPrefix={editor.valueHiddenPrefix} />
  </TypeScriptBlockContainer>
));

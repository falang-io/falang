import type { IBlockView } from '@falang/scheme';
import { TypeScriptBlockContainer } from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';

interface IQuestionOptionData {
  readonly label: string;
}

/** Read-only — the label comes from the header's options list (see `QuestionEditorStore.syncOptionChildren`), never edited directly on the option node itself. */
export const QuestionOptionBlockComponent: IBlockView<IQuestionOptionData> = observer(({ data }) => (
  <TypeScriptBlockContainer>
    <div className="workflow-integration-block">{data?.label || <>&nbsp;</>}</div>
  </TypeScriptBlockContainer>
));

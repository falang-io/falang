import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { CodeViewComponent, TemplateStringViewComponent, TypeScriptBlockContainer } from '@falang/typescript-scheme';
import type { TQuestionHeaderData } from '@falang/workflow-integrations-common';
import { observer } from 'mobx-react-lite';
import { TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';

/**
 * Only the question text is shown on the canvas block (bot/chat/options are sidebar-only, per spec)
 * — the descriptor's first `questionFields` entry is treated as "the question", rendered per its
 * own `kind` (Telegram's is `template-string`, same viewer the `log` block's message uses).
 */
export const QuestionHeaderBlockComponent: IBlockView<TQuestionHeaderData> = observer(({ data, icon }) => {
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  const descriptor = registry.findQuestion(icon.name);
  if (!descriptor || !data) return <div>&nbsp;</div>;
  const questionField = descriptor.questionFields[0];
  const value = questionField ? ((data[questionField.name] as string | undefined) ?? '') : '';
  return (
    <TypeScriptBlockContainer>
      <div className="workflow-integration-block">
        {questionField?.kind === 'expression' ? (
          <CodeViewComponent value={value} />
        ) : (
          <TemplateStringViewComponent value={value} />
        )}
      </div>
    </TypeScriptBlockContainer>
  );
});

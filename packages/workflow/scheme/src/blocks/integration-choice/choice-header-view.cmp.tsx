import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { CodeViewComponent, TemplateStringViewComponent, TypeScriptBlockContainer } from '@falang/typescript-scheme';
import type { TChoiceHeaderData } from '@falang/workflow-integrations-common';
import { observer } from 'mobx-react-lite';
import { TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';

/**
 * Only the prompt text is shown on the canvas block (bot/model/options are sidebar-only) — mirrors
 * `QuestionHeaderBlockComponent`'s convention, the descriptor's first `promptFields` entry is
 * treated as "the prompt", rendered per its own `kind`.
 */
export const ChoiceHeaderBlockComponent: IBlockView<TChoiceHeaderData> = observer(({ data, icon }) => {
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  const descriptor = registry.findChoice(icon.name);
  if (!descriptor || !data) return <div>&nbsp;</div>;
  const promptField = descriptor.promptFields[0];
  const value = promptField ? ((data[promptField.name] as string | undefined) ?? '') : '';
  return (
    <TypeScriptBlockContainer>
      <div className="workflow-integration-block">
        {promptField?.kind === 'expression' ? (
          <CodeViewComponent value={value} />
        ) : (
          <TemplateStringViewComponent value={value} />
        )}
      </div>
    </TypeScriptBlockContainer>
  );
});

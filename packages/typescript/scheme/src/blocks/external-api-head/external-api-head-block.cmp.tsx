import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IExternalApiHead } from './external-api-head-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';

export const ExternalApiHeadBlockComponent: IBlockView<IExternalApiHead> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <div className="ts-input-value">{data.name || <>&nbsp;</>}</div>
    </TypeScriptBlockContainer>
  );
});

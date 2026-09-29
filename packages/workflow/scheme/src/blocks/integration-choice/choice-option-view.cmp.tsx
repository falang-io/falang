import type { IBlockView } from '@falang/scheme';
import { variableInfoToTsType } from '@falang/typescript-dto';
import { TypeScriptBlockContainer } from '@falang/typescript-scheme';
import type { IChoiceOptionData } from '@falang/workflow-integrations-common';
import { observer } from 'mobx-react-lite';

/** Read-only — alias+dataType come from the header's options list (see `ChoiceEditorStore`), never edited directly on the option node itself. */
export const ChoiceOptionBlockComponent: IBlockView<IChoiceOptionData> = observer(({ data }) => (
  <TypeScriptBlockContainer>
    <div className="workflow-integration-block">
      {data ? `${data.alias}: ${data.variable}: ${variableInfoToTsType(data.dataType)}` : <>&nbsp;</>}
    </div>
  </TypeScriptBlockContainer>
));

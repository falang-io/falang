import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { TCodeLanguage } from '@falang/simple-code-dto';
import { RawCodeViewComponent } from '../../block-elements/raw-code/raw-code.view.cmp.js';

export const getRawCodeBlockComponent = (language: TCodeLanguage): IBlockView<string> =>
  observer(({ data }) => <RawCodeViewComponent value={data} language={language} />);

import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { TemplateStringViewComponent } from '../../block-elements/template-string/template-string-view.cmp.js';

export const LogBlockComponent: IBlockView<string> = observer(({ data }) => (
  <TemplateStringViewComponent value={data} />
));

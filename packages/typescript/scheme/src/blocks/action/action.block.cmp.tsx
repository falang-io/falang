import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';

export const ActionBlockComponent: IBlockView<string> = observer(({ data }) => <CodeViewComponent value={data} />);

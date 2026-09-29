import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const TextSidebarBlockComponent: IBlockView<string> = observer(({ data }) => (
  <div style={{ whiteSpace: 'pre-wrap' }}>{data}</div>
));

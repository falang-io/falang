import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const TextBlockComponent: IBlockView<string> = observer(({ data }) => (
  <div dangerouslySetInnerHTML={{ __html: data?.length ? data : '&nbsp;' }} />
));

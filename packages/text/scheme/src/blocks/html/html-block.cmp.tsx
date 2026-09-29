import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const HtmlBlockComponent: IBlockView<string> = observer(({ data }) => (
  <div className="falang-html-content" dangerouslySetInnerHTML={{ __html: data?.length ? data : '&nbsp;' }} />
));

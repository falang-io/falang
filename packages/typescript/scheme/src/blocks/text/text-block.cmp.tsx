import type { IBlockView } from '@falang/scheme';
import { sanitizeHtml } from '../../utils/sanitize-html.js';
import { observer } from 'mobx-react-lite';

export const TextBlockComponent: IBlockView<string> = observer(({ data }) => (
  <div dangerouslySetInnerHTML={{ __html: data?.length ? sanitizeHtml(data) : '&nbsp;' }} />
));

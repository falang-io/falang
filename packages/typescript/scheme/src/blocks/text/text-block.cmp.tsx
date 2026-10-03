import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { decodeLegacyHtml } from '../expression/decode-legacy-html.js';

export const TextBlockComponent: IBlockView<string> = observer(({ data }) => (
  <div style={{ whiteSpace: 'pre-wrap' }}>{data?.length ? decodeLegacyHtml(data) : '\u00A0'}</div>
));

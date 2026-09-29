import type { IBlockView } from '@falang/scheme';
import { TOKEN_SCHEME, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const SchemeTitleBlockComponent: IBlockView<unknown> = observer(() => {
  const scheme = useService(TOKEN_SCHEME);

  return <div style={{ textAlign: 'center' }}>{scheme.name}</div>;
});

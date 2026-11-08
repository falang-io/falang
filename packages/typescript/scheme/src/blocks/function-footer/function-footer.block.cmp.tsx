import { TOKEN_I18N, useService, type IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const FunctionFooterBlockComponent: IBlockView = observer(() => {
  const t = useService(TOKEN_I18N).t;
  return (
    <div style={{ textAlign: 'center', whiteSpace: 'nowrap', userSelect: 'none' }}>{t('function-footer:end')}</div>
  );
});

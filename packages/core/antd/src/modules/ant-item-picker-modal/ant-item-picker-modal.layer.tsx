import { observer } from 'mobx-react-lite';
import { TOKEN_I18N, useService } from '@falang/scheme';
import { ItemPickerModal } from './item-picker-modal.cmp.js';
import { TOKEN_ANT_ITEM_PICKER_MODAL } from './ant-item-picker-modal.token.js';

export const AntItemPickerModalLayer = observer(() => {
  const service = useService(TOKEN_ANT_ITEM_PICKER_MODAL);
  const t = useService(TOKEN_I18N).t;
  return (
    <ItemPickerModal
      open={service.opened}
      title={t('insert-modal:title')}
      items={service.items}
      searchPlaceholder={t('insert-modal:search')}
      emptyText={t('insert-modal:empty')}
      onClose={() => service.hide()}
    />
  );
});

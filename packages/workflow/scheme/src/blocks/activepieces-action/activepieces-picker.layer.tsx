import { TOKEN_I18N, useService } from '@falang/scheme';
import { Modal, Select, Spin } from 'antd';
import { observer } from 'mobx-react-lite';
import { TOKEN_ACTIVEPIECES_PICKER } from '../../registry/di-tokens.js';

/** `''` reads as "no value" for `selectedKey`, but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

/** Modal opened by `ActivepiecesPickerModule`'s `CMD_INSERT_NODE` veto — see `ActivepiecesPickerStore`. */
export const ActivepiecesPickerLayer = observer(() => {
  const store = useService(TOKEN_ACTIVEPIECES_PICKER);
  const t = useService(TOKEN_I18N).t;
  return (
    <Modal
      title={t('activepieces-picker:title')}
      open={store.opened}
      onCancel={() => store.close()}
      onOk={() => store.confirm()}
      okButtonProps={{ disabled: !store.selectedKey }}
      destroyOnHidden
    >
      {store.catalogLoading ? (
        <Spin />
      ) : (
        <Select
          autoFocus
          showSearch
          style={{ width: '100%' }}
          placeholder={t('activepieces-picker:select-placeholder')}
          value={emptyToUnset(store.selectedKey)}
          options={[...store.options]}
          optionFilterProp="label"
          notFoundContent={t('activepieces-picker:no-integrations')}
          onChange={(value: string) => store.select(value)}
        />
      )}
    </Modal>
  );
});

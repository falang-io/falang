import { TOKEN_I18N, useService } from '@falang/scheme';
import { ExpressionEditorCellComponent } from '@falang/typescript-scheme';
import { MAX_MESSAGE_BUTTONS, type TMessageButtonKind } from '@falang/workflow-integrations-common';
import { Alert, Button, Card, Flex, Select, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import type { ButtonsFieldStore, IButtonRow } from './buttons-field.store.js';

/** One line tall, grows with the text — a caption or a URL is short. */
const ROW_FIELD_MIN_HEIGHT = 32;

const KIND_LABEL_KEYS: Record<TMessageButtonKind, string> = {
  url: 'integration-editor:button-kind-url',
  command: 'integration-editor:button-kind-command',
};

const VALUE_LABEL_KEYS: Record<TMessageButtonKind, string> = {
  url: 'integration-editor:button-url',
  command: 'integration-editor:button-command',
};

const ButtonRowComponent: React.FC<{ store: ButtonsFieldStore; row: IButtonRow; index: number }> = observer(
  ({ store, row, index }) => {
    const t = useService(TOKEN_I18N).t;
    return (
      <Card size="small" data-testid="message-button-row" styles={{ body: { padding: 8 } }}>
        <Flex vertical gap={6}>
          <Flex gap={6} align="center">
            <Select
              size="small"
              style={{ flex: 1 }}
              value={row.kind}
              onChange={(kind: TMessageButtonKind) => store.setKind(row.key, kind)}
              options={(['url', 'command'] as const).map((kind) => ({ value: kind, label: t(KIND_LABEL_KEYS[kind]) }))}
              data-testid="message-button-kind"
            />
            <Button
              size="small"
              disabled={index === 0}
              onClick={() => store.moveRow(row.key, -1)}
              title={t('integration-editor:move-up')}
            >
              ↑
            </Button>
            <Button
              size="small"
              disabled={index === store.rows.length - 1}
              onClick={() => store.moveRow(row.key, 1)}
              title={t('integration-editor:move-down')}
            >
              ↓
            </Button>
            <Button
              size="small"
              danger
              onClick={() => store.removeRow(row.key)}
              title={t('integration-editor:remove-button')}
              data-testid="message-button-remove"
            >
              ✕
            </Button>
          </Flex>
          <Typography.Text type="secondary">{t('integration-editor:button-text')}</Typography.Text>
          <ExpressionEditorCellComponent
            store={row.text.codeStore}
            hiddenPrefix={row.text.hiddenPrefix}
            hiddenSuffix={row.text.hiddenSuffix}
            autoFocus={false}
            minHeight={ROW_FIELD_MIN_HEIGHT}
            variant="default"
          />
          <Typography.Text type="secondary">{t(VALUE_LABEL_KEYS[row.kind])}</Typography.Text>
          <ExpressionEditorCellComponent
            store={row.value.codeStore}
            hiddenPrefix={row.value.hiddenPrefix}
            hiddenSuffix={row.value.hiddenSuffix}
            autoFocus={false}
            minHeight={ROW_FIELD_MIN_HEIGHT}
            variant="default"
          />
        </Flex>
      </Card>
    );
  },
);

/** The sidebar editor of a `buttons` field: a card per button and an "Add button" at the end. */
export const ButtonsFieldEditorComponent: React.FC<{ store: ButtonsFieldStore }> = observer(({ store }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <Flex vertical gap={8} data-testid="message-buttons-editor">
      {store.parseError && <Alert type="warning" showIcon message={t('integration-editor:buttons-invalid')} />}
      {store.rows.map((row, index) => (
        <ButtonRowComponent key={row.key} store={store} row={row} index={index} />
      ))}
      <Button
        onClick={() => store.addRow()}
        disabled={!store.canAdd}
        {...(store.canAdd ? {} : { title: t('integration-editor:buttons-limit', { count: MAX_MESSAGE_BUTTONS }) })}
        data-testid="message-button-add"
      >
        {t('integration-editor:add-button')}
      </Button>
    </Flex>
  );
});

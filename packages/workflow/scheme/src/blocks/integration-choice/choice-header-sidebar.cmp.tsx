import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_I18N, useService } from '@falang/scheme';
import { ExpressionEditorCellComponent, NewVariableEditingComponent } from '@falang/typescript-scheme';
import { getChoiceHeaderFields, type IFieldConfig } from '@falang/workflow-integrations-common';
import { Button, Form, Input, Select, Space, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { DATA_TYPE_OPTIONS, type ChoiceEditorStore } from './choice-editor.store.js';

const SIDEBAR_EXPRESSION_MIN_HEIGHT = 160;
const SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL = 32;

/** `field.fieldSize === 'small'` starts the box at one line and lets it grow; default keeps the fixed tall box. */
const getSidebarExpressionMinHeight = (field: IFieldConfig): number =>
  field.fieldSize === 'small' ? SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL : SIDEBAR_EXPRESSION_MIN_HEIGHT;

/** Same placeholder rule `integration-action-field-controls.cmp.tsx`'s `dynamicSelectPlaceholder` uses. */
const dynamicSelectPlaceholder = (editor: ChoiceEditorStore, t: (key: string) => string): string => {
  if (editor.optionsLoading) return t('integration-editor:loading');
  if (editor.dynamicOptions.length === 0) return t('integration-editor:select-credential-first');
  return t('integration-editor:select-placeholder');
};

const DATA_TYPE_LABEL_KEYS: Record<string, string> = {
  string: 'integration-editor:result-text',
  number: 'integration-editor:type-number',
  boolean: 'integration-editor:type-boolean',
};

const filterOptionByLabel = (input: string, option?: { label: string }): boolean =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase());

/** `''` reads as "no value" for these fields, but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

/** One header field's control — same field-kind split `question-header-sidebar.cmp.tsx`'s `QuestionFieldEditorComponent` uses. */
const ChoiceFieldEditorComponent: React.FC<{ editor: ChoiceEditorStore; field: IFieldConfig }> = observer(
  ({ editor, field }) => {
    const t = useService(TOKEN_I18N).t;
    if (field.kind === 'expression') {
      const store = editor.codeStores.get(field.name);
      if (!store) return null;
      return (
        <ExpressionEditorCellComponent
          store={store}
          hiddenPrefix={editor.getExpressionHiddenPrefix(field)}
          autoFocus={false}
          minHeight={getSidebarExpressionMinHeight(field)}
          variant="default"
        />
      );
    }
    if (field.kind === 'template-string') {
      const store = editor.templateStringStores.get(field.name);
      if (!store) return null;
      return (
        <ExpressionEditorCellComponent
          store={store.codeStore}
          hiddenPrefix={store.hiddenPrefix}
          hiddenSuffix={store.hiddenSuffix}
          autoFocus={false}
          minHeight={getSidebarExpressionMinHeight(field)}
          variant="default"
        />
      );
    }
    if (field.kind === 'credential-ref' || field.kind === 'select') {
      const options = editor.getFieldOptions(field);
      const isDynamic = field.kind === 'select' && Boolean(field.loadOptions);
      return (
        <Select
          style={{ width: '100%' }}
          value={emptyToUnset(editor.values.get(field.name) ?? '')}
          onChange={(value: string) => editor.setFieldValue(field.name, value ?? '')}
          options={options.map((option) => ({ value: option.value, label: t(option.label) }))}
          placeholder={isDynamic ? dynamicSelectPlaceholder(editor, t) : t('integration-editor:select-placeholder')}
          disabled={isDynamic && (editor.optionsLoading || options.length === 0)}
          allowClear
          showSearch={{ optionFilterProp: 'label', filterOption: filterOptionByLabel }}
        />
      );
    }
    return (
      <Input
        value={editor.values.get(field.name) ?? ''}
        onChange={(event) => editor.setFieldValue(field.name, event.target.value)}
      />
    );
  },
);

/**
 * The alias+dataType options list — append at the end, edit any row's alias/type in place, delete
 * only the last row. See `ChoiceEditorStore.removeLastOption`'s doc for why arbitrary mid-list
 * delete/reorder isn't offered here. The picked-data variable name is edited once, above this list
 * (see `ChoiceHeaderSidebarComponent`) — not per row, since every branch binds the same identifier.
 */
const ChoiceOptionsEditorComponent: React.FC<{ editor: ChoiceEditorStore }> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {editor.options.map((option, index) => (
        <Space key={index} style={{ width: '100%' }}>
          <Input
            value={option.alias}
            placeholder={t('integration-editor:alias')}
            onChange={(event) => editor.setOptionAlias(index, event.target.value)}
          />
          <Select
            style={{ width: 140 }}
            value={editor.getOptionDataTypeSelectValue(index)}
            onChange={(value: string) => editor.setOptionDataType(index, value)}
            options={DATA_TYPE_OPTIONS.map((dataTypeOption) => ({
              value: dataTypeOption.value,
              label: t(DATA_TYPE_LABEL_KEYS[dataTypeOption.value] ?? dataTypeOption.label),
            }))}
          />
          {index === editor.options.length - 1 && editor.options.length > 1 && (
            <Button danger onClick={() => editor.removeLastOption()}>
              ✕
            </Button>
          )}
        </Space>
      ))}
      <Button onClick={() => editor.addOption()}>{t('integration-editor:add-option')}</Button>
    </Space>
  );
});

export const ChoiceHeaderSidebarComponent: TBlockEditorView<ChoiceEditorStore> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <div className="workflow-integration-editor workflow-integration-editor--sidebar">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t(editor.descriptor.label)}
      </Typography.Title>
      <Form layout="vertical">
        {getChoiceHeaderFields(editor.descriptor).map((field) => (
          <Form.Item key={field.name} label={t(field.label)} style={{ marginBottom: 14 }}>
            <ChoiceFieldEditorComponent editor={editor} field={field} />
          </Form.Item>
        ))}
        <Form.Item label={t('integration-editor:variable')} style={{ marginBottom: 14 }}>
          <NewVariableEditingComponent store={editor.variableStore} autoFocus={false} variant="default" />
        </Form.Item>
        <Form.Item label={t('integration-editor:options')} style={{ marginBottom: 14 }}>
          <ChoiceOptionsEditorComponent editor={editor} />
        </Form.Item>
      </Form>
    </div>
  );
});

import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_I18N, useService } from '@falang/scheme';
import { ExpressionEditorCellComponent } from '@falang/typescript-scheme';
import {
  getQuestionHeaderFields,
  type IFieldConfig,
  type TTaskOptionDataType,
} from '@falang/workflow-integrations-common';
import { Button, Form, Input, Select, Space, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { QUESTION_OPTION_DATA_TYPE_OPTIONS, type QuestionEditorStore } from './question-editor.store.js';

const OPTION_DATA_TYPE_LABEL_KEYS: Record<string, string> = {
  void: 'integration-editor:type-void',
  string: 'integration-editor:result-text',
  number: 'integration-editor:type-number',
  boolean: 'integration-editor:type-boolean',
};

const SIDEBAR_EXPRESSION_MIN_HEIGHT = 160;
const SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL = 32;

/** `field.fieldSize === 'small'` starts the box at one line and lets it grow; default keeps the fixed tall box. */
const getSidebarExpressionMinHeight = (field: IFieldConfig): number =>
  field.fieldSize === 'small' ? SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL : SIDEBAR_EXPRESSION_MIN_HEIGHT;

const filterOptionByLabel = (input: string, option?: { label: string }): boolean =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase());

/** `''` reads as "no value" for these fields, but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

/** One header field's control — same field-kind split `SidebarFieldEditorComponent` uses for action nodes, minus kinds that don't apply to a question's header (`secret`/`result-type`/`new-variable`). */
const QuestionFieldEditorComponent: React.FC<{ editor: QuestionEditorStore; field: IFieldConfig }> = observer(
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
      return (
        <Select
          style={{ width: '100%' }}
          value={emptyToUnset(editor.values.get(field.name) ?? '')}
          onChange={(value: string) => editor.setFieldValue(field.name, value ?? '')}
          options={options.map((option) => ({ value: option.value, label: t(option.label) }))}
          placeholder={t('integration-editor:select-placeholder')}
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
 * The button-options list — append at the end, edit any row's label in place, delete only the last
 * row. See `QuestionEditorStore.removeLastOption`'s doc for why arbitrary mid-list delete/reorder
 * isn't offered here. With `descriptor.optionDataTypes` (ADR 0040 (private) §4), each row also
 * gets a `dataType` `Select` + a `prompt` `Input`, mirroring `ChoiceOptionsEditorComponent`. The
 * automatic `timeout` option (when `descriptor.timeoutField` is set) never appears here at all —
 * see `QuestionEditorStore`'s own doc comment.
 */
const QuestionOptionsEditorComponent: React.FC<{ editor: QuestionEditorStore }> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {editor.options.map((label, index) => (
        <Space key={index} direction="vertical" style={{ width: '100%' }}>
          <Space style={{ width: '100%' }}>
            <Input value={label} onChange={(event) => editor.setOptionLabel(index, event.target.value)} />
            {editor.descriptor.optionDataTypes && (
              <Select
                style={{ width: 120 }}
                value={editor.optionMeta[index]?.dataType ?? 'void'}
                onChange={(value: TTaskOptionDataType) => editor.setOptionDataType(index, value)}
                options={QUESTION_OPTION_DATA_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(OPTION_DATA_TYPE_LABEL_KEYS[option.value] ?? option.label),
                }))}
              />
            )}
            {index === editor.options.length - 1 && editor.options.length > 1 && (
              <Button danger onClick={() => editor.removeLastOption()}>
                ✕
              </Button>
            )}
          </Space>
          {editor.descriptor.optionDataTypes && editor.optionMeta[index]?.dataType !== 'void' && (
            <Input
              placeholder={t('integration-editor:prompt')}
              value={editor.optionMeta[index]?.prompt ?? ''}
              onChange={(event) => editor.setOptionPrompt(index, event.target.value)}
            />
          )}
        </Space>
      ))}
      <Button onClick={() => editor.addOption()}>{t('integration-editor:add-option')}</Button>
    </Space>
  );
});

export const QuestionHeaderSidebarComponent: TBlockEditorView<QuestionEditorStore> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <div className="workflow-integration-editor workflow-integration-editor--sidebar">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t(editor.descriptor.label)}
      </Typography.Title>
      <Form layout="vertical">
        {getQuestionHeaderFields(editor.descriptor).map((field) => (
          <Form.Item key={field.name} label={t(field.label)} style={{ marginBottom: 14 }}>
            <QuestionFieldEditorComponent editor={editor} field={field} />
          </Form.Item>
        ))}
        <Form.Item label={t('integration-editor:options')} style={{ marginBottom: 14 }}>
          <QuestionOptionsEditorComponent editor={editor} />
        </Form.Item>
      </Form>
    </div>
  );
});

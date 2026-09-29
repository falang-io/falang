import { TOKEN_I18N, useService } from '@falang/scheme';
import { TsSelect } from '@falang/typescript-scheme';
import type { IFieldConfig } from '@falang/workflow-integrations-common';
import { Flex, Select } from 'antd';
import { observer } from 'mobx-react-lite';
import type { IntegrationActionEditorStore } from './integration-action-editor.store.js';

/** The inline layout's field select — plain `TsSelect` (matches its `ts-input` table-cell siblings). */
export const FieldSelectComponent: React.FC<{
  editor: IntegrationActionEditorStore;
  field: IFieldConfig;
  placeholder: string;
  disabled?: boolean;
}> = observer(({ editor, field, placeholder, disabled }) => {
  const t = useService(TOKEN_I18N).t;
  const options = editor.getFieldOptions(field);
  return (
    <div className="ts-select-wrapper">
      <TsSelect
        className="ts-select"
        value={editor.values.get(field.name) ?? ''}
        onChange={(event) => editor.setFieldValue(field.name, event.currentTarget.value)}
        style={{ width: '100%' }}
        disabled={disabled}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </TsSelect>
    </div>
  );
});

/** A `result-type` field's control — plain text vs. a project struct ("structured output"). */
export const ResultTypeFieldComponent: React.FC<{ editor: IntegrationActionEditorStore; field: IFieldConfig }> =
  observer(({ editor, field }) => {
    const t = useService(TOKEN_I18N).t;
    const info = editor.getResultInfo(field);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="ts-select-wrapper">
          <TsSelect
            className="ts-select"
            value={info.type}
            onChange={(event) => editor.setResultMode(field, event.currentTarget.value as 'string' | 'struct')}
            style={{ width: '100%' }}
          >
            <option value="string">{t('integration-editor:result-text')}</option>
            <option value="struct">{t('integration-editor:result-structured-output')}</option>
          </TsSelect>
        </div>
        {info.type === 'struct' && (
          <div className="ts-select-wrapper">
            <TsSelect
              className="ts-select"
              value={info.id}
              onChange={(event) => editor.setResultStructId(field, event.currentTarget.value)}
              style={{ width: '100%' }}
            >
              <option value="" disabled>
                {t('integration-editor:select-struct-placeholder')}
              </option>
              {editor.structTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name || type.id}
                </option>
              ))}
            </TsSelect>
          </div>
        )}
      </div>
    );
  });

export const dynamicSelectPlaceholder = (editor: IntegrationActionEditorStore, t: (key: string) => string): string => {
  if (editor.optionsLoading) return t('integration-editor:loading');
  if (editor.dynamicOptions.length === 0) return t('integration-editor:select-credential-first');
  return t('integration-editor:select-placeholder');
};

const filterOptionByLabel = (input: string, option?: { label: string }): boolean =>
  (option?.label ?? '').toLowerCase().includes(input.toLowerCase());

/** `''` reads as "no value" for these fields, but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

/** The sidebar layout's field select — an antd `Select` (theme-aware, searchable by label). */
export const SidebarFieldSelectComponent: React.FC<{
  editor: IntegrationActionEditorStore;
  field: IFieldConfig;
  placeholder: string;
  disabled?: boolean;
}> = observer(({ editor, field, placeholder, disabled }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <Select
      style={{ width: '100%' }}
      value={emptyToUnset(editor.values.get(field.name) ?? '')}
      onChange={(value: string) => editor.setFieldValue(field.name, value ?? '')}
      options={editor.getFieldOptions(field).map((option) => ({ value: option.value, label: t(option.label) }))}
      placeholder={placeholder}
      disabled={disabled}
      allowClear
      showSearch={{ optionFilterProp: 'label', filterOption: filterOptionByLabel }}
    />
  );
});

/** A `result-type` field's antd control — plain text vs. a project struct ("structured output"). */
export const SidebarResultTypeFieldComponent: React.FC<{ editor: IntegrationActionEditorStore; field: IFieldConfig }> =
  observer(({ editor, field }) => {
    const t = useService(TOKEN_I18N).t;
    const info = editor.getResultInfo(field);
    return (
      <Flex vertical gap={8}>
        <Select
          style={{ width: '100%' }}
          value={info.type}
          onChange={(value: 'string' | 'struct') => editor.setResultMode(field, value)}
          options={[
            { value: 'string', label: t('integration-editor:result-text') },
            { value: 'struct', label: t('integration-editor:result-structured-output') },
          ]}
        />
        {info.type === 'struct' && (
          <Select
            style={{ width: '100%' }}
            value={emptyToUnset(info.id)}
            onChange={(value: string) => editor.setResultStructId(field, value ?? '')}
            options={editor.structTypes.map((type) => ({ value: type.id, label: type.name || type.id }))}
            placeholder={t('integration-editor:select-struct-placeholder')}
            showSearch={{ optionFilterProp: 'label', filterOption: filterOptionByLabel }}
          />
        )}
      </Flex>
    );
  });

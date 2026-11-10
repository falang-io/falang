import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_I18N, useService } from '@falang/scheme';
import {
  ExpressionEditorCellComponent,
  NewVariableEditingComponent,
  TypeScriptBlockContainer,
} from '@falang/typescript-scheme';
import type { IFieldConfig } from '@falang/workflow-integrations-common';
import { Alert, Form, Input, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { FieldLabel } from '../field-help/field-help.cmp.js';
import { ButtonsFieldEditorComponent } from './buttons-field-editor.cmp.js';
import {
  dynamicSelectPlaceholder,
  FieldSelectComponent,
  ResultTypeFieldComponent,
  SidebarFieldSelectComponent,
  SidebarResultTypeFieldComponent,
} from './integration-action-field-controls.cmp.js';
import type { IntegrationActionEditorStore } from './integration-action-editor.store.js';

/** Taller than the inline single-cell Monaco box — this is the "sidebar" multiline editor. */
const SIDEBAR_EXPRESSION_MIN_HEIGHT = 160;
const SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL = 32;

/** `field.fieldSize === 'small'` starts the box at one line and lets it grow; default keeps the fixed tall box. */
const getSidebarExpressionMinHeight = (field: IFieldConfig): number =>
  field.fieldSize === 'small' ? SIDEBAR_EXPRESSION_MIN_HEIGHT_SMALL : SIDEBAR_EXPRESSION_MIN_HEIGHT;

/** The sidebar layout's per-field control — same field kinds as `FieldEditorComponent`, antd-based controls. */
const SidebarFieldEditorComponent: React.FC<{ editor: IntegrationActionEditorStore; field: IFieldConfig }> = observer(
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
    if (field.kind === 'credential-ref') {
      return (
        <SidebarFieldSelectComponent
          editor={editor}
          field={field}
          placeholder={t('integration-editor:select-credential-placeholder')}
        />
      );
    }
    if (field.kind === 'document-ref') {
      return (
        <SidebarFieldSelectComponent
          editor={editor}
          field={field}
          placeholder={t('integration-editor:select-table-placeholder')}
        />
      );
    }
    if (field.kind === 'result-type') {
      return <SidebarResultTypeFieldComponent editor={editor} field={field} />;
    }
    if (field.kind === 'buttons') {
      const store = editor.buttonsStores.get(field.name);
      return store ? <ButtonsFieldEditorComponent store={store} /> : null;
    }
    if (field.kind === 'new-variable') {
      const store = editor.newVariableStores.get(field.name);
      if (!store) return null;
      return <NewVariableEditingComponent store={store} autoFocus={false} variant="default" />;
    }
    if (field.kind === 'select') {
      if (field.loadOptions) {
        return (
          <SidebarFieldSelectComponent
            editor={editor}
            field={field}
            placeholder={dynamicSelectPlaceholder(editor, t)}
            disabled={
              editor.optionsLoading || editor.dynamicOptions.length === 0 || editor.unsupportedOnBuiltInAiProvider
            }
          />
        );
      }
      return (
        <SidebarFieldSelectComponent
          editor={editor}
          field={field}
          placeholder={t('integration-editor:select-placeholder')}
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

const FieldEditorComponent: React.FC<{
  editor: IntegrationActionEditorStore;
  field: IFieldConfig;
  /** Only relevant for `kind: 'expression'`/`'template-string'` — taller in the sidebar layout. */
  expressionMinHeight?: number;
}> = observer(({ editor, field, expressionMinHeight }) => {
  const t = useService(TOKEN_I18N).t;
  if (field.kind === 'expression') {
    const store = editor.codeStores.get(field.name);
    if (!store) return null;
    return (
      <ExpressionEditorCellComponent
        store={store}
        hiddenPrefix={editor.getExpressionHiddenPrefix(field)}
        autoFocus={false}
        minHeight={expressionMinHeight}
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
        minHeight={expressionMinHeight}
      />
    );
  }
  if (field.kind === 'credential-ref') {
    return (
      <FieldSelectComponent
        editor={editor}
        field={field}
        placeholder={t('integration-editor:select-credential-placeholder')}
      />
    );
  }
  if (field.kind === 'document-ref') {
    return (
      <FieldSelectComponent
        editor={editor}
        field={field}
        placeholder={t('integration-editor:select-table-placeholder')}
      />
    );
  }
  if (field.kind === 'result-type') {
    return <ResultTypeFieldComponent editor={editor} field={field} />;
  }
  if (field.kind === 'buttons') {
    const store = editor.buttonsStores.get(field.name);
    return store ? <ButtonsFieldEditorComponent store={store} /> : null;
  }
  if (field.kind === 'new-variable') {
    const store = editor.newVariableStores.get(field.name);
    if (!store) return null;
    return <NewVariableEditingComponent store={store} autoFocus={false} />;
  }
  if (field.kind === 'select') {
    if (field.loadOptions) {
      return (
        <FieldSelectComponent
          editor={editor}
          field={field}
          placeholder={dynamicSelectPlaceholder(editor, t)}
          disabled={
            editor.optionsLoading || editor.dynamicOptions.length === 0 || editor.unsupportedOnBuiltInAiProvider
          }
        />
      );
    }
    return (
      <FieldSelectComponent editor={editor} field={field} placeholder={t('integration-editor:select-placeholder')} />
    );
  }
  return (
    <input
      type="text"
      value={editor.values.get(field.name) ?? ''}
      onChange={(event) => editor.setFieldValue(field.name, event.target.value)}
    />
  );
});

/** "The built-in AI provider doesn't support this action yet" (ADR 0081 (private) decision 7) — only while it applies. */
const BuiltInAiProviderHint: React.FC<{ editor: IntegrationActionEditorStore }> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  if (!editor.unsupportedOnBuiltInAiProvider) return null;
  const name = editor.getAiProviderName() ?? t('integration-editor:built-in-ai-provider');
  return (
    <Alert
      data-testid="ai-provider-unsupported-hint"
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={t('integration-editor:built-in-ai-provider-unsupported', { name })}
    />
  );
});

/** The compact single-row-per-field layout every inline action (e.g. `telegram-send-message`) uses. */
const InlineActionEditorComponent: TBlockEditorView<IntegrationActionEditorStore> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  // No title here: the icon's own `BlockTitle` (`title` of the node config) stays rendered above the editor.
  return (
    <TypeScriptBlockContainer>
      <div className="workflow-integration-editor">
        <BuiltInAiProviderHint editor={editor} />
        <table className="ts-table ts-table--fixed">
          <tbody>
            {editor.action.fields.map((field) => (
              <tr key={field.name}>
                <td>
                  <div className="ts-label">
                    <FieldLabel label={field.label} help={field.help} t={t} />
                  </div>
                </td>
                <td>
                  <FieldEditorComponent editor={editor} field={field} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TypeScriptBlockContainer>
  );
});

/** The vertical, one-field-per-row layout for actions opened as a full sidebar panel (e.g. `call-ai-text`). */
const SidebarActionEditorComponent: TBlockEditorView<IntegrationActionEditorStore> = observer(({ editor }) => {
  const t = useService(TOKEN_I18N).t;
  return (
    <div className="workflow-integration-editor workflow-integration-editor--sidebar">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t(editor.action.label)}
      </Typography.Title>
      <BuiltInAiProviderHint editor={editor} />
      <Form layout="vertical">
        {editor.action.fields.map((field) => (
          <Form.Item
            key={field.name}
            label={<FieldLabel label={field.label} help={field.help} t={t} />}
            style={{ marginBottom: 14 }}
          >
            <SidebarFieldEditorComponent editor={editor} field={field} />
          </Form.Item>
        ))}
      </Form>
    </div>
  );
});

export const IntegrationActionEditorComponent: TBlockEditorView<IntegrationActionEditorStore> = observer(
  ({ editor, icon }) =>
    editor.editorType === 'sidebar' ? (
      <SidebarActionEditorComponent editor={editor} icon={icon} />
    ) : (
      <InlineActionEditorComponent editor={editor} icon={icon} />
    ),
);

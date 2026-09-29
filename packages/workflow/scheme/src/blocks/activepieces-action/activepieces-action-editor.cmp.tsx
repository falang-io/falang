import type { TBlockEditorView } from '@falang/scheme';
import { ExpressionEditorCellComponent } from '@falang/typescript-scheme';
import type { IActivepiecesPropertyCatalogEntry } from '@falang/workflow-integrations-activepieces';
import { Form, Select, Spin, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import type { ActivepiecesActionEditorStore } from './activepieces-action-editor.store.js';

/** `''` reads as "no value" for these fields, but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

const isDropdownType = (type: string): boolean =>
  type === 'STATIC_DROPDOWN' || type === 'DROPDOWN' || type === 'MULTI_SELECT_DROPDOWN';

interface IDropdownFieldProps {
  editor: ActivepiecesActionEditorStore;
  prop: IActivepiecesPropertyCatalogEntry;
}

const DropdownFieldComponent = observer(({ editor, prop }: IDropdownFieldProps) => {
  const loading = prop.type !== 'STATIC_DROPDOWN' && editor.isOptionsLoading(prop.name);
  const disabled = prop.type === 'DROPDOWN' && !editor.credentialId;
  const options = [...editor.getDropdownOptions(prop)];
  if (prop.type === 'MULTI_SELECT_DROPDOWN') {
    return (
      <Select
        mode="multiple"
        allowClear
        showSearch
        optionFilterProp="label"
        loading={loading}
        disabled={disabled}
        options={options}
        value={editor.getMultiDropdownValue(prop.name)}
        onChange={(values: string[]) => editor.setMultiDropdownValue(prop.name, values)}
      />
    );
  }
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      loading={loading}
      disabled={disabled}
      options={options}
      value={editor.getDropdownValue(prop.name)}
      onChange={(value: string | undefined) => editor.setDropdownValue(prop.name, value)}
    />
  );
});

/** Shown once, before `pieceName`/`actionName` are set — see the store's class doc. */
const PickerComponent: TBlockEditorView<ActivepiecesActionEditorStore> = observer(({ editor }) => {
  if (editor.catalogLoading) return <Spin />;
  return (
    <Form layout="vertical">
      <Form.Item label="Piece">
        <Select
          showSearch
          placeholder="Select a piece"
          options={[...editor.pieceOptions]}
          optionFilterProp="label"
          onChange={(pieceName: string) => {
            const firstAction = editor.catalog.find((piece) => piece.pieceName === pieceName)?.actions[0];
            if (firstAction) editor.pick(pieceName, firstAction.name);
          }}
        />
      </Form.Item>
    </Form>
  );
});

const PropsFormComponent: TBlockEditorView<ActivepiecesActionEditorStore> = observer(({ editor }) => {
  const selectedAction = editor.selectedAction;
  return (
    <div className="workflow-integration-editor workflow-integration-editor--sidebar">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {editor.selectedPiece?.displayName ?? editor.pieceName}: {selectedAction?.displayName ?? editor.actionName}
      </Typography.Title>
      <Form layout="vertical">
        <Form.Item label="Credential">
          <Select
            placeholder="Select a credential"
            options={[...editor.credentialOptions]}
            value={emptyToUnset(editor.credentialId)}
            onChange={(value: string) => editor.setCredentialId(value)}
          />
        </Form.Item>
        {(selectedAction?.props ?? []).map((prop) => {
          if (isDropdownType(prop.type)) {
            return (
              <Form.Item key={prop.name} label={prop.displayName} style={{ marginBottom: 14 }}>
                <DropdownFieldComponent editor={editor} prop={prop} />
              </Form.Item>
            );
          }
          const store = editor.codeStores.get(prop.name);
          if (!store) return null;
          return (
            <Form.Item key={prop.name} label={prop.displayName} style={{ marginBottom: 14 }}>
              <ExpressionEditorCellComponent
                store={store}
                hiddenPrefix={editor.hiddenScopeCode}
                autoFocus={false}
                variant="default"
              />
            </Form.Item>
          );
        })}
      </Form>
    </div>
  );
});

export const ActivepiecesActionEditorComponent: TBlockEditorView<ActivepiecesActionEditorStore> = observer(
  ({ editor, icon }) =>
    editor.pieceName && editor.actionName ? (
      <PropsFormComponent editor={editor} icon={icon} />
    ) : (
      <PickerComponent editor={editor} icon={icon} />
    ),
);

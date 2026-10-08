import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Empty, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography, message } from 'antd';
import { pieceToCredentialIntegration } from '@falang/workflow-integrations-activepieces';
import type {
  IIntegrationInstance,
  IIntegrationsDocumentData,
  IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { useWorkflowStore } from '../workflow-store-context.js';
import { generateUuid } from '../generate-uuid.js';
import {
  fieldKey,
  formValuesToFields,
  instanceToFormValues,
  isOAuth2Connected,
  type IIntegrationFormValues,
} from '../integrations-editor-form.js';
import { createActivepiecesCatalogProvider } from '../integrations-document-helpers.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { connectOAuth2Instance } from '../oauth2-connect.js';
import { OAuth2ConnectionField } from './oauth2-connection-field.cmp.js';
import { useDisabledVendors } from './use-disabled-vendors.js';
import { useVendorAutoName } from './use-vendor-auto-name.js';
import { VendorDataSyncField } from './vendor-data-sync-field.cmp.js';

const { Title } = Typography;

/** Ant-based CRUD editor for the pinned `integrations` document's credential instances — see ADR 0006's "Credentials" section. */
export const IntegrationsEditor: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const doc = store.integrationsDocument;
  const [form] = Form.useForm<IIntegrationFormValues>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [dynamicIntegrations, setDynamicIntegrations] = useState<readonly IWorkflowIntegration[]>([]);
  const [connecting, setConnecting] = useState(false);
  const disabledVendors = useDisabledVendors();

  // ActivePieces vendors aren't statically registered — see ADR 0010 (private).
  // Without this, there would be no way to ever create a credential for one.
  useEffect(() => {
    let cancelled = false;
    createActivepiecesCatalogProvider()
      .getPieces()
      .then((pieces) => {
        if (!cancelled) setDynamicIntegrations(pieces.map((piece) => pieceToCredentialIntegration(piece)));
      })
      .catch(() => {
        // keep the static-only list on failure
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allIntegrations = useMemo(
    () => [...REGISTERED_INTEGRATIONS, ...dynamicIntegrations].filter((item) => !disabledVendors.includes(item.vendor)),
    [dynamicIntegrations, disabledVendors],
  );
  const findIntegration = (vendor: string): IWorkflowIntegration | undefined =>
    allIntegrations.find((item) => item.vendor === vendor);
  const vendorAutoName = useVendorAutoName(form, findIntegration, t);

  const instances = useMemo(
    () => (doc?.customData as IIntegrationsDocumentData | undefined)?.instances ?? [],
    [doc?.customData],
  );

  const openCreate = () => {
    const firstVendor = allIntegrations[0]?.vendor ?? null;
    setEditingId(null);
    setSelectedVendor(firstVendor);
    form.resetFields();
    form.setFieldsValue({ name: '', vendor: firstVendor ?? '' });
    vendorAutoName.reset();
    vendorAutoName.apply(firstVendor);
    setModalOpen(true);
  };

  const openEdit = (instance: IIntegrationInstance) => {
    const integration = findIntegration(instance.vendor);
    if (!integration) return;
    setEditingId(instance.id);
    setSelectedVendor(instance.vendor);
    form.setFieldsValue(instanceToFormValues(instance, integration));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setSelectedVendor(null);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const integration = findIntegration(values.vendor);
    if (!integration) return;
    const previousInstance = instances.find((instance) => instance.id === editingId);
    store.saveIntegrationInstance({
      id: editingId ?? generateUuid(),
      vendor: integration.vendor,
      name: values.name,
      fields: formValuesToFields(integration, values, previousInstance),
    });
    closeModal();
  };

  /** Saves the credential (assigning it an id if new) immediately, then opens the vendor's consent
   * screen in a popup and waits for the backend's callback to report back — see `oauth2-connect.ts`. */
  const handleConnect = async () => {
    const values = await form.validateFields();
    const integration = findIntegration(values.vendor);
    if (!integration?.oauth2) return;
    const id = editingId ?? generateUuid();
    const previousInstance = instances.find((instance) => instance.id === editingId);
    setEditingId(id);
    setConnecting(true);
    try {
      const result = await connectOAuth2Instance(
        {
          projectId: store.projectId,
          saveInstance: (instance) => store.saveIntegrationInstance(instance),
          flushSave: () => store.flushIntegrationsSave(),
          refreshDocument: () => store.refreshIntegrationsDocument(),
        },
        {
          id,
          vendor: integration.vendor,
          name: values.name,
          fields: formValuesToFields(integration, values, previousInstance),
        },
      );
      if (result.status === 'success') message.success(t('client:integrations-editor.oauth2-connected'));
      else message.error(result.message ?? t('client:integrations-editor.oauth2-connect-failed'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('client:integrations-editor.oauth2-connect-failed'));
    } finally {
      setConnecting(false);
    }
  };

  /** "Sync structure" — see `VendorDataSyncField`/`WorkflowStore.syncIntegrationSchema` and
   *  ADR 0039 (private) §4. Only ever shown for an already-saved instance
   *  (`editingId !== null`), so `store.syncIntegrationSchema` always has a real `credentialId`. */
  const handleSync = async () => {
    if (!editingId) return;
    try {
      await store.syncIntegrationSchema(editingId);
      message.success(t('client:integrations-editor.sync-structure-success'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('client:integrations-editor.sync-structure-failed'));
    }
  };

  if (!doc) return null;

  const activeIntegration = selectedVendor ? findIntegration(selectedVendor) : null;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title style={{ margin: 0 }}>{t('client:integrations-editor.title')}</Title>
        <Button type="primary" onClick={openCreate}>
          {t('client:integrations-editor.add')}
        </Button>
      </div>

      {instances.length === 0 ? (
        <Empty description={t('client:integrations-editor.no-integrations')} />
      ) : (
        <Table<IIntegrationInstance>
          rowKey="id"
          dataSource={[...instances]}
          pagination={false}
          columns={[
            { title: t('client:integrations-editor.name'), dataIndex: 'name' },
            {
              title: t('client:integrations-editor.vendor'),
              dataIndex: 'vendor',
              render: (vendor: string) => {
                const label = findIntegration(vendor)?.label;
                return <Tag>{label ? t(label) : vendor}</Tag>;
              },
            },
            {
              title: '',
              key: 'actions',
              width: 160,
              render: (_, instance) => (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" onClick={() => openEdit(instance)}>
                    {t('client:integrations-editor.edit')}
                  </Button>
                  <Popconfirm
                    title={t('client:integrations-editor.delete-confirm')}
                    onConfirm={() => store.deleteIntegrationInstance(instance.id)}
                  >
                    <Button size="small" danger>
                      {t('client:integrations-editor.delete')}
                    </Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={
          editingId ? t('client:integrations-editor.modal-edit-title') : t('client:integrations-editor.modal-add-title')
        }
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        destroyOnHidden
      >
        <Form<IIntegrationFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('client:integrations-editor.name')}
            rules={[{ required: true, message: t('client:integrations-editor.name-required') }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="vendor" label={t('client:integrations-editor.vendor')} rules={[{ required: true }]}>
            <Select
              disabled={editingId !== null}
              showSearch
              optionFilterProp="label"
              options={allIntegrations.map((integration) => ({
                value: integration.vendor,
                label: t(integration.label),
              }))}
              onChange={(vendor: string) => {
                setSelectedVendor(vendor);
                if (editingId === null) vendorAutoName.apply(vendor);
              }}
            />
          </Form.Item>
          {activeIntegration?.credentialFields
            .filter((field) => !field.hidden)
            .map((field) =>
              field.kind === 'secret' ? (
                <div key={field.name} style={{ display: 'flex', gap: 12 }}>
                  <Form.Item name={fieldKey(field, 'dev')} label={`${t(field.label)} (dev)`} style={{ flex: 1 }}>
                    <Input.Password autoComplete="off" />
                  </Form.Item>
                  <Form.Item name={fieldKey(field, 'prod')} label={`${t(field.label)} (prod)`} style={{ flex: 1 }}>
                    <Input.Password autoComplete="off" />
                  </Form.Item>
                </div>
              ) : (
                <Form.Item key={field.name} name={fieldKey(field)} label={t(field.label)}>
                  {field.kind === 'select' ? (
                    <Select
                      options={field.options?.map((option) => ({ value: option.value, label: t(option.label) }))}
                    />
                  ) : (
                    <Input autoComplete="off" />
                  )}
                </Form.Item>
              ),
            )}
          {activeIntegration?.oauth2 && (
            <OAuth2ConnectionField
              connected={isOAuth2Connected(instances.find((instance) => instance.id === editingId))}
              connecting={connecting}
              onConnect={() => {
                handleConnect().catch(() => {
                  // errors are already reported via `message.error` inside handleConnect
                });
              }}
            />
          )}
          {editingId !== null && activeIntegration?.syncVendorData && (
            <VendorDataSyncField
              vendorData={store.vendorData.byInstance.get(editingId)}
              syncing={store.vendorData.syncing.has(editingId)}
              onSync={() => {
                handleSync().catch(() => {
                  // errors are already reported via `message.error` inside handleSync
                });
              }}
            />
          )}
        </Form>
      </Modal>
    </div>
  );
});

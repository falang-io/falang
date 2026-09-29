import type React from 'react';
import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import type { IDriverFieldDescriptor } from '../../../shared/driver-config.js';
import {
  DEVICE_PIN_MODE_CPP,
  DEVICE_PIN_MODES,
  type IDeviceInstance,
  type IDevicePinConfig,
  type TDevicePinMode,
} from '../../../shared/devices-document.js';
import type { ArduinoProjectStore } from '../arduino-project-store.js';
import { DevicesDocumentStore } from '../devices-document-store.js';
import { getDriverConfigs } from '../driver-nodes/driver-registry-cache.js';
import { appTheme } from '../theme.js';

const { Title, Text } = Typography;

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, overflow: 'auto', padding: 24, background: appTheme.background },
  section: { marginTop: 24 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { margin: 0 },
  card: { marginBottom: 12 },
  cardTitleInput: { maxWidth: 280 },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  fieldLabel: { width: 140, flexShrink: 0 },
  fieldControl: { flex: 1, minWidth: 0 },
};

/** One driver `device.fields` control, keyed by `field.kind` — mirrors `driver-action-block.config.tsx`'s
 * `FieldEditorControl` (the driver-*action* node's own field editor), but built from plain antd controls
 * instead of the scheme-block `ts-*` classes, since this editor is an ordinary page, not a block. A
 * `device` section can never declare a `new-variable` field (rejected by `parseDriverConfig`, see
 * `driver-config.ts`), so unlike that other control this one has no such branch. */
const DeviceFieldControl: React.FC<{
  field: IDriverFieldDescriptor;
  value: string;
  onChange: (value: string) => void;
}> = observer(({ field, value, onChange }) => {
  if (field.kind === 'select') {
    return (
      <Select
        value={value}
        style={styles.fieldControl}
        onChange={(next: string) => onChange(next)}
        options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
      />
    );
  }
  if (field.kind === 'boolean') {
    return <Switch checked={value === 'true'} onChange={(checked) => onChange(checked ? 'true' : 'false')} />;
  }
  if (field.kind === 'string') {
    return <Input style={styles.fieldControl} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  // 'pin' | 'number' — antd's `InputNumber` is a controlled component whose "empty" value really is
  // `undefined` (not `null`, not `0`), for both the value it renders and what it reports back on
  // change; a bare `number` field (no declared `min`) also genuinely wants no floor, hence `min`'s
  // own `undefined` fallback below.
  // oxlint-disable-next-line no-undefined
  const numericValue = value === '' ? undefined : Number(value);
  return (
    <InputNumber
      style={styles.fieldControl}
      value={numericValue}
      // oxlint-disable-next-line no-undefined
      min={field.min ?? (field.kind === 'pin' ? 0 : undefined)}
      max={field.max}
      // oxlint-disable-next-line no-undefined
      onChange={(next) => onChange(next === null || next === undefined ? '' : String(next))}
    />
  );
});

interface Props {
  store: ArduinoProjectStore;
  documentId: string;
}

/**
 * The `Devices` document editor (ADR 0032 (private),
 * "Decision → 3") — an antd page (no scheme, no node tree) with a **Digital pins** table and a
 * **Devices** table, rendered by `ProjectWorkspace` in place of `SchemeView` for the `devices`
 * document's tab. Built fresh on every reload (`useMemo` keyed on the document id and
 * `store.getReloadVersion(documentId)` — see that method's own doc comment on `ArduinoProjectStore`)
 * since `DevicesDocumentStore` only ever parses `document.data` once, in its constructor.
 */
export const DevicesEditor: React.FC<Props> = observer(({ store, documentId }) => {
  const t = getGlobalI18n().t;
  const reloadVersion = store.getReloadVersion(documentId);
  const editor = useMemo(() => {
    const document = store.getDocument(documentId);
    if (!document) return null;
    return new DevicesDocumentStore({
      document,
      drivers: getDriverConfigs(),
      onChange: (data) => store.setDevicesDocumentData(documentId, data),
    });
  }, [store, documentId, reloadVersion]);

  if (!editor) return null;

  const addDeviceMenu: MenuProps = {
    items: editor.deviceDrivers.map((driver) => ({ key: driver.id, label: driver.label })),
    onClick: ({ key }) => editor.addDevice(key),
  };

  return (
    <div style={styles.root}>
      <Title level={3}>{t('desktop-app-arduino:devices-editor.title')}</Title>

      {editor.loadError ? (
        <Alert
          type="warning"
          showIcon
          message={t('desktop-app-arduino:devices-editor.load-error')}
          description={editor.loadError}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Title level={4} style={styles.sectionTitle}>
            {t('desktop-app-arduino:devices-editor.pins-title')}
          </Title>
          <Button icon={<PlusOutlined />} onClick={() => editor.addPin()}>
            {t('desktop-app-arduino:devices-editor.add-pin')}
          </Button>
        </div>
        <Table<IDevicePinConfig>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={[...editor.pins]}
          locale={{ emptyText: t('desktop-app-arduino:devices-editor.no-pins') }}
          columns={[
            {
              title: t('desktop-app-arduino:devices-editor.pin-column-pin'),
              key: 'pin',
              width: 120,
              render: (_value, record) => (
                <InputNumber
                  min={0}
                  value={record.pin}
                  onChange={(next) => editor.updatePin(record.id, { pin: next ?? 0 })}
                />
              ),
            },
            {
              title: t('desktop-app-arduino:devices-editor.pin-column-mode'),
              key: 'mode',
              width: 200,
              render: (_value, record) => (
                <Select<TDevicePinMode>
                  style={{ width: '100%' }}
                  value={record.mode}
                  onChange={(next) => editor.updatePin(record.id, { mode: next })}
                  options={DEVICE_PIN_MODES.map((mode) => ({ value: mode, label: DEVICE_PIN_MODE_CPP[mode] }))}
                />
              ),
            },
            {
              title: t('desktop-app-arduino:devices-editor.pin-column-label'),
              key: 'label',
              render: (_value, record) => (
                <Input
                  value={record.label ?? ''}
                  onChange={(event) => editor.updatePin(record.id, { label: event.target.value })}
                />
              ),
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_value, record) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => editor.removePin(record.id)} />
              ),
            },
          ]}
        />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Title level={4} style={styles.sectionTitle}>
            {t('desktop-app-arduino:devices-editor.devices-title')}
          </Title>
          <Space>
            {editor.deviceDrivers.length === 0 ? (
              <Text type="secondary">{t('desktop-app-arduino:devices-editor.no-device-drivers')}</Text>
            ) : null}
            <Dropdown menu={addDeviceMenu} disabled={editor.deviceDrivers.length === 0} trigger={['click']}>
              <Button icon={<PlusOutlined />}>{t('desktop-app-arduino:devices-editor.add-device')}</Button>
            </Dropdown>
          </Space>
        </div>

        {editor.devices.length === 0 ? (
          <Empty description={t('desktop-app-arduino:devices-editor.no-devices')} />
        ) : (
          editor.devices.map((device: IDeviceInstance) => {
            const driver = editor.drivers.find((candidate) => candidate.id === device.driverId);
            return (
              <Card
                key={device.id}
                size="small"
                style={styles.card}
                title={
                  <Input
                    style={styles.cardTitleInput}
                    value={device.name}
                    onChange={(event) => editor.updateDeviceName(device.id, event.target.value)}
                  />
                }
                extra={
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => editor.removeDevice(device.id)} />
                }
              >
                <Text type="secondary">{driver?.label ?? device.driverId}</Text>
                <div style={{ marginTop: 8 }}>
                  {driver?.device
                    ? driver.device.fields.map((field) => (
                        <div key={field.name} style={styles.fieldRow}>
                          <div style={styles.fieldLabel}>{field.label}</div>
                          <DeviceFieldControl
                            field={field}
                            value={device.params[field.name] ?? ''}
                            onChange={(value) => editor.updateDeviceParam(device.id, field.name, value)}
                          />
                        </div>
                      ))
                    : t('desktop-app-arduino:devices-editor.unknown-driver')}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
});

import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import {
  coerceConstantValue,
  CONSTANT_TYPES,
  defaultConstantValue,
  validateConstantName,
  type IWorkflowConstant,
  type TConstantType,
  type TConstantValue,
} from '@falang/workflow-dto';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useWorkflowStore } from '../workflow-store-context.js';
import { generateUuid } from '../generate-uuid.js';

const { Title, Paragraph, Text } = Typography;

type TEnv = 'dev' | 'prod';

const newConstant = (): IWorkflowConstant => ({ id: generateUuid(), name: '', type: 'string', dev: '', prod: '' });

/** Typing a name: letters go upper-case and spaces/dashes become `_`, so `api url` reads as `API_URL`. */
export const toConstantNameInput = (text: string): string => text.toUpperCase().replaceAll(/[\s-]/g, '_');

/** The localised reason a draft name can't be saved, or `null`. */
const nameProblem = (
  draft: IWorkflowConstant,
  constants: readonly IWorkflowConstant[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null => {
  if (validateConstantName(draft.name) !== null) return t('client:constants-editor.name-help');
  const taken = constants.some((item) => item.id !== draft.id && item.name === draft.name);
  return taken ? t('client:constants-editor.name-taken', { name: draft.name }) : null;
};

interface IValueInputProps {
  readonly type: TConstantType;
  readonly value: TConstantValue;
  readonly disabled: boolean;
  readonly onChange: (value: TConstantValue) => void;
  readonly testId: string;
}

const ValueInput: React.FC<IValueInputProps> = ({ type, value, disabled, onChange, testId }) => {
  if (type === 'boolean') {
    return <Switch checked={value === true} disabled={disabled} onChange={onChange} data-testid={testId} />;
  }
  if (type === 'number') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        onChange={(next) => onChange(typeof next === 'number' && Number.isFinite(next) ? next : 0)}
        data-testid={testId}
      />
    );
  }
  return (
    <Input.TextArea
      autoSize={{ minRows: 1, maxRows: 6 }}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
    />
  );
};

const ValueView: React.FC<{ readonly value: TConstantValue; readonly emptyLabel: string }> = ({
  value,
  emptyLabel,
}) => {
  if (typeof value === 'boolean') return <Tag>{String(value)}</Tag>;
  if (value === '') return <Text type="secondary">{emptyLabel}</Text>;
  return (
    <Text code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {String(value)}
    </Text>
  );
};

/**
 * The pinned `constants` document: a table of named values with a dev and a prod value each (`@falang/workflow-dto`'s
 * `constants/`). Every code field of the project sees them as globals; the compiler bakes in the values of the
 * environment it builds for. Rows are added and edited in a dialog, saved through `WorkflowStore.saveConstants`.
 */
export const ConstantsEditor: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [draft, setDraft] = useState<IWorkflowConstant | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  if (!store.constantsDocument) return null;
  const { readOnly } = store;
  const { constants } = store;

  const openCreate = () => {
    setDraft(newConstant());
    setIsNew(true);
    setNameTouched(false);
  };
  const openEdit = (constant: IWorkflowConstant) => {
    setDraft({ ...constant });
    setIsNew(false);
    setNameTouched(true);
  };
  const close = () => setDraft(null);

  const save = (next: readonly IWorkflowConstant[]): boolean => {
    try {
      store.saveConstants(next);
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('client:constants-editor.save-failed'));
      return false;
    }
  };

  const problem = draft ? nameProblem(draft, constants, t) : null;
  const submit = () => {
    if (!draft) return;
    setNameTouched(true);
    if (problem) return;
    const next = isNew ? [...constants, draft] : constants.map((item) => (item.id === draft.id ? draft : item));
    if (save(next)) close();
  };

  const setType = (type: TConstantType) => {
    if (!draft) return;
    setDraft({
      ...draft,
      type,
      dev: coerceConstantValue(type, draft.dev),
      prod: coerceConstantValue(type, draft.prod),
    });
  };
  const setValue = (env: TEnv, value: TConstantValue) => {
    if (draft) setDraft({ ...draft, [env]: value });
  };

  const typeLabel = (type: TConstantType) => t(`client:constants-editor.type-${type}`);
  const emptyLabel = t('client:constants-editor.empty-value');

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }} data-testid="constants-editor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Title style={{ margin: 0 }}>{t('client:constants-editor.title')}</Title>
        {!readOnly && (
          <Button type="primary" onClick={openCreate} data-testid="constants-add">
            {t('client:constants-editor.add')}
          </Button>
        )}
      </div>
      <Paragraph type="secondary" style={{ maxWidth: 760 }}>
        {t('client:constants-editor.intro')}
      </Paragraph>

      {constants.length === 0 ? (
        <Empty description={t('client:constants-editor.empty')} />
      ) : (
        <Table<IWorkflowConstant>
          rowKey="id"
          dataSource={[...constants]}
          pagination={false}
          data-testid="constants-table"
          onRow={(constant) =>
            ({ 'data-testid': `constant-row-${constant.name}` }) as React.HTMLAttributes<HTMLElement>
          }
          columns={[
            {
              title: t('client:constants-editor.name'),
              dataIndex: 'name',
              render: (name: string) => <Text code>{name}</Text>,
            },
            {
              title: t('client:constants-editor.type'),
              dataIndex: 'type',
              width: 120,
              render: (type: TConstantType) => <Tag>{typeLabel(type)}</Tag>,
            },
            {
              title: t('client:constants-editor.dev'),
              dataIndex: 'dev',
              render: (value: TConstantValue) => <ValueView value={value} emptyLabel={emptyLabel} />,
            },
            {
              title: t('client:constants-editor.prod'),
              dataIndex: 'prod',
              render: (value: TConstantValue) => <ValueView value={value} emptyLabel={emptyLabel} />,
            },
            {
              title: '',
              key: 'actions',
              width: 180,
              render: (_, constant) => (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" onClick={() => openEdit(constant)}>
                    {readOnly ? t('client:constants-editor.view') : t('client:constants-editor.edit')}
                  </Button>
                  {!readOnly && (
                    <Popconfirm
                      title={t('client:constants-editor.delete-confirm')}
                      onConfirm={() => save(constants.filter((item) => item.id !== constant.id))}
                    >
                      <Button size="small" danger>
                        {t('client:constants-editor.delete')}
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={draft !== null}
        title={isNew ? t('client:constants-editor.modal-add-title') : t('client:constants-editor.modal-edit-title')}
        onCancel={close}
        onOk={submit}
        okButtonProps={{ disabled: readOnly, 'data-testid': 'constant-save' } as React.ComponentProps<typeof Button>}
        destroyOnHidden
      >
        {draft && (
          <Form layout="vertical" disabled={readOnly} onFinish={submit}>
            <Form.Item
              label={t('client:constants-editor.name')}
              validateStatus={nameTouched && problem ? 'error' : ''}
              help={nameTouched && problem ? problem : t('client:constants-editor.name-help')}
            >
              <Input
                autoFocus
                autoComplete="off"
                value={draft.name}
                placeholder="SOME_CONSTANT_NAME"
                style={{ fontFamily: 'monospace' }}
                onChange={(event) => setDraft({ ...draft, name: toConstantNameInput(event.target.value) })}
                onBlur={() => setNameTouched(true)}
                data-testid="constant-name"
              />
            </Form.Item>
            <Form.Item label={t('client:constants-editor.type')}>
              <Select<TConstantType>
                value={draft.type}
                onChange={setType}
                options={CONSTANT_TYPES.map((type) => ({ value: type, label: typeLabel(type) }))}
                data-testid="constant-type"
              />
            </Form.Item>
            {(['dev', 'prod'] as const).map((env) => (
              <Form.Item key={env} label={t(`client:constants-editor.${env}`)}>
                <ValueInput
                  type={draft.type}
                  value={draft[env] ?? defaultConstantValue(draft.type)}
                  disabled={readOnly}
                  onChange={(value) => setValue(env, value)}
                  testId={`constant-${env}`}
                />
              </Form.Item>
            ))}
          </Form>
        )}
      </Modal>
    </div>
  );
});

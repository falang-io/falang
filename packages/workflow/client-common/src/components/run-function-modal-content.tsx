import type React from 'react';
import { Alert, Button, Form, Input, InputNumber, Segmented, Select, Space, Switch, Typography } from 'antd';
import type { TFunction } from '@falang/scheme';
import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import type { IApiFunctionSignature, IApiRunFunctionResult, TApiRunTarget } from '../api-client.js';

/** One typed input widget per parameter kind — kept as an if-chain rather than a nested ternary. */
const renderParamInput = (type: TVariableInfo, t: TFunction): React.ReactNode => {
  if (type.type === 'boolean') return <Switch />;
  if (type.type === 'number') return <InputNumber style={{ width: '100%' }} />;
  if (type.type === 'string') return <Input />;
  return <Input.TextArea rows={3} placeholder={t('client:run-function-modal.json-value-placeholder')} />;
};

const resultAlert = (result: IApiRunFunctionResult, t: TFunction): React.ReactNode => {
  if (result.status === 'completed') {
    return (
      <Alert
        type="success"
        showIcon
        message={t('client:run-function-modal.completed')}
        description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result.result, null, 2)}</pre>}
      />
    );
  }
  if (result.status === 'failed') {
    return (
      <Alert
        type="error"
        showIcon
        message={t('client:run-function-modal.workflow-failed')}
        description={result.message}
      />
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      message={t('client:run-function-modal.still-running')}
      description={t('client:run-function-modal.no-result-timeout', { workflowId: result.workflowId })}
    />
  );
};

interface IRunFunctionModalContentProps {
  readonly functions: IApiFunctionSignature[];
  readonly selectedFunctionName: string;
  readonly setSelectedFunctionName: (name: string) => void;
  readonly selectedFunction: IApiFunctionSignature | null;
  readonly form: ReturnType<typeof Form.useForm>[0];
  readonly isLive: boolean;
  readonly fixedTarget?: TApiRunTarget;
  readonly target: TApiRunTarget;
  readonly setTarget: (target: TApiRunTarget) => void;
  readonly targetUnavailableReason: string | null;
  readonly runError: string | null;
  readonly runResult: IApiRunFunctionResult | null;
  readonly running: boolean;
  readonly onRun: () => void;
  readonly t: TFunction;
}

/**
 * The function picker, target switcher, arguments form and run outcome — split out from
 * `RunFunctionModal` purely to keep each component's cyclomatic complexity under the linter's cap;
 * its own conditional-rendering chain is the bulk of the modal's decision points.
 */
export const RunFunctionModalContent: React.FC<IRunFunctionModalContentProps> = ({
  functions,
  selectedFunctionName,
  setSelectedFunctionName,
  selectedFunction,
  form,
  isLive,
  fixedTarget,
  target,
  setTarget,
  targetUnavailableReason,
  runError,
  runResult,
  running,
  onRun,
  t,
}) => {
  if (functions.length === 0) {
    return <Typography.Text type="secondary">{t('client:run-function-modal.no-functions')}</Typography.Text>;
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Typography.Text type="secondary">{t('client:run-function-modal.function-label')}</Typography.Text>
        <Select<string>
          style={{ width: '100%' }}
          value={selectedFunctionName}
          onChange={setSelectedFunctionName}
          options={functions.map((fn) => ({ value: fn.name, label: fn.name }))}
        />
      </Space>

      {!fixedTarget && !isLive && (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Typography.Text type="secondary">{t('client:run-function-modal.target-label')}</Typography.Text>
          <Segmented<TApiRunTarget>
            value={target}
            onChange={setTarget}
            options={[
              { label: t('client:run-function-modal.target-dev'), value: 'dev' },
              { label: t('client:run-function-modal.target-published'), value: 'published' },
            ]}
          />
        </Space>
      )}

      {selectedFunction && selectedFunction.parameters.length > 0 && (
        <Form form={form} layout="vertical">
          {selectedFunction.parameters.map((param) => (
            <Form.Item
              key={param.name}
              name={param.name}
              label={`${param.name}: ${variableInfoToTsType(param.type)}`}
              valuePropName={param.type.type === 'boolean' ? 'checked' : 'value'}
              {...(param.type.type === 'boolean' ? { initialValue: false } : {})}
            >
              {renderParamInput(param.type, t)}
            </Form.Item>
          ))}
        </Form>
      )}

      {targetUnavailableReason && <Alert type="warning" showIcon message={targetUnavailableReason} />}
      {runError && <Alert type="error" showIcon message={runError} />}
      {runResult && resultAlert(runResult, t)}

      <Button
        type="primary"
        loading={running}
        disabled={!selectedFunction || Boolean(targetUnavailableReason)}
        onClick={onRun}
      >
        {t('client:run-function-modal.run')}
      </Button>
    </Space>
  );
};

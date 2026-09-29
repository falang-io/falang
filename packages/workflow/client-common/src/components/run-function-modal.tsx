import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Form, Modal, Spin } from 'antd';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  workflowApi,
  type IApiFunctionSignature,
  type IApiRunFunctionResult,
  type TApiRunTarget,
} from '../api-client.js';
import { RunFunctionModalContent } from './run-function-modal-content.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Preselects this function when the modal opens — e.g. the document open in the active tab. */
  readonly initialFunctionName?: string | null;
  /** Whether the dev runner is currently up — gates the "Dev" target. */
  readonly isDevRunning: boolean;
  /** When set, locks the run target to this value and hides the Dev/Published switcher — used by the toolbar's Dev menu, which only ever runs against dev. */
  readonly fixedTarget?: TApiRunTarget;
  /**
   * Live mode (the toolbar's "Run" button, ADR 0022 (private)): instead of posting to `/run` and
   * waiting for the result here, hand the function and its arguments to the caller (which builds if
   * needed, starts the run and follows it in the editor) and close once it resolves `true`. Implies
   * the dev target, and no "dev not running" gate — the caller builds.
   */
  readonly onStart?: (functionName: string, args: readonly unknown[]) => Promise<boolean>;
}

/** Parses one parameter's raw form value into the JS value `args` expects, based on its declared type. */
const parseParamValue = (type: TVariableInfo, raw: unknown, t: TFunction): unknown => {
  if (type.type === 'boolean') return Boolean(raw);
  if (type.type === 'number') return Number(raw);
  if (type.type === 'string') return raw ?? '';
  // Structured/array/enum/union/any types have no single-widget editor — entered as JSON instead.
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(t('client:run-function-modal.invalid-json'));
  }
};

/** Why the chosen target can't be run right now, or `null` if it can — live mode has no gate, the caller (`LiveRunStore.startFunction`) builds. */
const resolveTargetUnavailableReason = (
  isLive: boolean,
  target: TApiRunTarget,
  isDevRunning: boolean,
  hasPublishedVersion: boolean,
  t: TFunction,
): string | null => {
  if (isLive) return null;
  if (target === 'dev') return isDevRunning ? null : t('client:run-function-modal.dev-not-running');
  return hasPublishedVersion ? null : t('client:run-function-modal.no-published-version');
};

/**
 * Manual-run form for the editor's "Run" button. Lists every function document (`GET
 * /projects/:id/functions`), renders one input per declared parameter (typed widgets for
 * boolean/string/number, a JSON textarea for everything else), and posts to `/projects/:id/run`
 * against either the dev task queue or the published/prod one.
 */
export const RunFunctionModal: React.FC<Props> = observer(
  ({ projectId, open, onClose, initialFunctionName, isDevRunning, fixedTarget, onStart }) => {
    const t = getGlobalI18n().t;
    const isLive = Boolean(onStart);
    const [form] = Form.useForm();
    const [functions, setFunctions] = useState<IApiFunctionSignature[] | null>(null);
    const [loadingFunctions, setLoadingFunctions] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedFunctionName, setSelectedFunctionName] = useState('');
    const [target, setTarget] = useState<TApiRunTarget>(fixedTarget ?? 'dev');
    const [hasPublishedVersion, setHasPublishedVersion] = useState(false);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [runResult, setRunResult] = useState<IApiRunFunctionResult | null>(null);

    useEffect(() => {
      if (!open) return;
      setLoadingFunctions(true);
      setLoadError(null);
      setRunResult(null);
      setRunError(null);
      workflowApi
        .listFunctions(projectId)
        .then((result) => {
          setFunctions(result);
          const preselected = result.find((fn) => fn.name === initialFunctionName);
          setSelectedFunctionName((preselected ?? result[0])?.name ?? '');
        })
        .catch((error: unknown) =>
          setLoadError(
            error instanceof Error ? error.message : t('client:run-function-modal.failed-to-load-functions'),
          ),
        )
        .finally(() => setLoadingFunctions(false));
      // The "published" target check only matters when the switcher is shown — a fixed target
      // already knows its own availability via `isDevRunning`/nothing else to check.
      if (!fixedTarget && !isLive) {
        workflowApi
          .listVersions(projectId)
          .then((versions) => setHasPublishedVersion(versions.length > 0))
          .catch(() => setHasPublishedVersion(false));
      }
    }, [open, projectId, initialFunctionName, fixedTarget, isLive]);

    const selectedFunction = useMemo(
      () => functions?.find((fn) => fn.name === selectedFunctionName) ?? null,
      [functions, selectedFunctionName],
    );

    const targetUnavailableReason = resolveTargetUnavailableReason(
      isLive,
      target,
      isDevRunning,
      hasPublishedVersion,
      t,
    );

    useEffect(() => {
      form.resetFields();
      setRunResult(null);
      setRunError(null);
    }, [selectedFunctionName, form]);

    const handleRun = () => {
      if (!selectedFunction) return;
      setRunError(null);
      setRunResult(null);

      let args: unknown[] = [];
      try {
        const values = form.getFieldsValue();
        args = selectedFunction.parameters.map((param) => parseParamValue(param.type, values[param.name], t));
      } catch (error) {
        setRunError(error instanceof Error ? error.message : t('client:run-function-modal.invalid-parameter-value'));
        return;
      }

      setRunning(true);
      if (onStart) {
        onStart(selectedFunction.name, args)
          .then((started) => {
            if (started) onClose();
          })
          .finally(() => setRunning(false));
        return;
      }
      workflowApi
        .runFunction(projectId, { functionName: selectedFunction.name, target, args })
        .then((result) => setRunResult(result))
        .catch((error: unknown) =>
          setRunError(error instanceof Error ? error.message : t('client:run-function-modal.run-failed')),
        )
        .finally(() => setRunning(false));
    };

    return (
      <Modal
        title={isLive ? t('client:run-function-modal.live-title') : t('client:run-function-modal.title')}
        open={open}
        onCancel={onClose}
        footer={null}
        width={600}
      >
        {loadingFunctions && <Spin />}
        {loadError && <Alert type="error" showIcon message={loadError} />}
        {!loadingFunctions && !loadError && functions && (
          <RunFunctionModalContent
            functions={functions}
            selectedFunctionName={selectedFunctionName}
            setSelectedFunctionName={setSelectedFunctionName}
            selectedFunction={selectedFunction}
            form={form}
            isLive={isLive}
            fixedTarget={fixedTarget}
            target={target}
            setTarget={setTarget}
            targetUnavailableReason={targetUnavailableReason}
            runError={runError}
            runResult={runResult}
            running={running}
            onRun={handleRun}
            t={t}
          />
        )}
      </Modal>
    );
  },
);

import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, Modal, Select, Tooltip } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IConnectedBoard } from '@falang/desktop-arduino-cli';
import type { ArduinoProjectStore } from '../arduino-project-store.js';
import { boardLabel } from '../../../shared/board.js';
import { reportError } from '../../../shared/report-error.js';
import type { TArduinoBuildOutcome } from '../../../shared/arduino-build-outcome.js';
import type { ISketchBuildResultForView, ISketchCodeFocus } from '../sketch-code-viewer-store.js';
import { SketchProblemsList } from './sketch-problems-list.js';
import { ArduinoCliNotices, ArduinoCoreNotice } from './arduino-cli-notices.js';
import { arduinoCliStatusStore as cli } from '../arduino-cli-status-store.js';
import { arduinoCoresStore as cores } from '../arduino-cores-store.js';

const refreshBoards = (setBoards: (boards: readonly IConnectedBoard[]) => void): void => {
  globalThis.falang.arduino
    .listBoards()
    .then(setBoards)
    .catch((error: unknown) => reportError('Failed to list boards', error));
};

// arduino-cli colours its summary lines; a textarea would show the escape codes literally.
// oxlint-disable-next-line no-control-regex -- matching the ANSI escape character is the point
const stripAnsi = (text: string): string => text.replaceAll(/\u001B\[[0-9;]*m/g, '');

/** What the problems list and "show in code" need from a finished build. */
const toBuildResult = (outcome: TArduinoBuildOutcome): ISketchBuildResultForView => {
  if (outcome.stage === 'core-missing') return { files: [], problems: [] };
  return outcome.stage === 'compile-error'
    ? { files: outcome.files ?? [], problems: outcome.problems ?? [] }
    : { files: outcome.files, diagnostics: outcome.diagnostics };
};

interface Props {
  store: ArduinoProjectStore;
  open: boolean;
  onClose: () => void;
}

export const BuildPanelModal: React.FC<Props> = observer(({ store, open, onClose }) => {
  const t = getGlobalI18n().t;
  // The board is chosen once, in the "New Project…" dialog, and never changes after (see
  // ADR 0032 (private), "Decision → 1") — no local `fqbn`
  // state or `Select` here anymore, just `store.board`.
  const fqbn = store.board;
  const [port, setPort] = useState<string>();
  const [boards, setBoards] = useState<readonly IConnectedBoard[]>([]);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildResult, setBuildResult] = useState<ISketchBuildResultForView | null>(null);

  useEffect(() => {
    if (!open) return;
    refreshBoards(setBoards);
    return cli.start();
  }, [open]);

  const cliAvailable = cli.status?.available === true;
  useEffect(() => {
    if (!open) return;
    if (!cliAvailable) {
      cores.reset();
      return;
    }
    cores.refresh(fqbn).catch((coreError: unknown) => reportError('Failed to check the board core', coreError));
  }, [open, cliAvailable, fqbn]);

  const debugUnsupported = cli.status?.serialMonitorSupported === false;
  const cliBusy = cli.busy !== null;

  const runBuild = async (upload: boolean): Promise<void> => {
    setError(null);
    setOutput('');
    setBuildResult(null);
    setBusy(true);
    try {
      const documents = store.toProjectDocuments();
      const outcome =
        upload && port
          ? await globalThis.falang.arduino.upload(store.projectDir, documents, fqbn, port)
          : await globalThis.falang.arduino.compile(store.projectDir, documents, fqbn);
      setBuildResult(toBuildResult(outcome));
      if (outcome.stage === 'compile-error') {
        // Per-document problems are listed (and clickable) below; a project-level failure has only its message.
        setError(
          outcome.problems && outcome.problems.length > 0
            ? t('desktop-app-arduino:build-panel.compile-failed', { count: outcome.problems.length })
            : outcome.message,
        );
        return;
      }
      if (outcome.stage === 'core-missing') {
        await cores.refresh(fqbn);
        setError(outcome.message);
        return;
      }
      setOutput(stripAnsi(outcome.result.output));
      if (!outcome.result.ok) setError(t('desktop-app-arduino:build-panel.cli-failed'));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Upload (debug)": closes this modal immediately (so the right-hand `DebuggerPanel` — which only
   * renders once `debugSession.status !== 'idle'` — has room to appear) and hands off to
   * `ArduinoProjectStore.debugSketch`, which itself drives the whole build+upload+attach sequence via
   * `ArduinoDebugAdapter` (ADR 0021 (private) §6). Errors surface through `debugSession.lastError`,
   * shown by the panel itself, not this modal — this button doesn't wait for the result.
   */
  /** A problem row: close this panel so the canvas is visible, then open the document at the node. */
  const jumpToNode = (documentId: string, nodeId?: string): void => {
    onClose();
    store.jumpToNode(documentId, nodeId);
  };

  /** A diagnostic's `file:line`: the code exactly as this build sent it, scrolled to the line. */
  const showInCode = (focus: ISketchCodeFocus): void => {
    if (!buildResult) return;
    onClose();
    store.codeViewer.showBuildResult({ ...buildResult, focus });
  };

  const viewCode = (): void => {
    onClose();
    store.codeViewer
      .openFresh()
      .catch((viewError: unknown) => reportError('Failed to generate the sketch code', viewError));
  };

  const runDebugUpload = (): Promise<void> => {
    if (!port) return Promise.resolve();
    return store.debugSketch(fqbn, port);
  };

  return (
    <Modal
      title="Build & Upload"
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ArduinoCliNotices />
        <ArduinoCoreNotice fqbn={fqbn} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>Board:</span>
          <span>{boardLabel(fqbn)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>Port:</span>
          <Select
            value={port}
            onChange={setPort}
            options={boards.map((board) => ({
              value: board.port,
              label: board.boardName ? `${board.port} (${board.boardName})` : board.port,
            }))}
            style={{ width: 260 }}
            placeholder="Select a port"
            allowClear
          />
          <Button onClick={() => refreshBoards(setBoards)}>Refresh</Button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" loading={busy} disabled={cliBusy && !busy} onClick={() => runBuild(false)}>
            Compile
          </Button>
          <Button loading={busy} disabled={!port || cliBusy} onClick={() => runBuild(true)}>
            Upload
          </Button>
          <Tooltip
            title={
              debugUnsupported
                ? 'The serial port module failed to load, so the debugger is unavailable. Reinstalling the app may help.'
                : null
            }
          >
            <Button
              loading={busy}
              disabled={!port || debugUnsupported || cliBusy}
              onClick={() => {
                onClose();
                runDebugUpload().catch((debugError: unknown) =>
                  reportError('Failed to start debug session', debugError),
                );
              }}
            >
              Upload (debug)
            </Button>
          </Tooltip>
          <Button onClick={viewCode} data-testid="build-panel-view-code">
            {t('desktop-app-arduino:build-panel.view-code')}
          </Button>
        </div>
        {error && <Alert type="error" message={<span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>} />}
        {buildResult && (
          <SketchProblemsList
            problems={buildResult.problems ?? []}
            diagnostics={buildResult.diagnostics ?? []}
            onJumpToNode={jumpToNode}
            onShowInCode={showInCode}
          />
        )}
        {output && (
          <Input.TextArea value={output} readOnly rows={12} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        )}
      </div>
    </Modal>
  );
});

import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, Modal, Select } from 'antd';
import type { IArduinoCliStatus, IConnectedBoard } from '@falang/desktop-arduino-cli';
import type { ArduinoProjectStore } from '../arduino-project-store.js';
import { boardLabel } from '../../../shared/board.js';
import { reportError } from '../../../shared/report-error.js';

const refreshBoards = (setBoards: (boards: readonly IConnectedBoard[]) => void): void => {
  globalThis.falang.arduino
    .listBoards()
    .then(setBoards)
    .catch((error: unknown) => reportError('Failed to list boards', error));
};

interface Props {
  store: ArduinoProjectStore;
  open: boolean;
  onClose: () => void;
}

export const BuildPanelModal: React.FC<Props> = observer(({ store, open, onClose }) => {
  // The board is chosen once, in the "New Project…" dialog, and never changes after (see
  // ADR 0032 (private), "Decision → 1") — no local `fqbn`
  // state or `Select` here anymore, just `store.board`.
  const fqbn = store.board;
  const [port, setPort] = useState<string>();
  const [boards, setBoards] = useState<readonly IConnectedBoard[]>([]);
  const [cliStatus, setCliStatus] = useState<IArduinoCliStatus | null>(null);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    globalThis.falang.arduino
      .checkCli()
      .then(setCliStatus)
      .catch((checkError: unknown) => reportError('Failed to check arduino-cli', checkError));
    refreshBoards(setBoards);
  }, [open]);

  const runBuild = async (upload: boolean): Promise<void> => {
    setError(null);
    setOutput('');
    setBusy(true);
    try {
      const documents = store.toProjectDocuments();
      const outcome =
        upload && port
          ? await globalThis.falang.arduino.upload(store.projectDir, documents, fqbn, port)
          : await globalThis.falang.arduino.compile(store.projectDir, documents, fqbn);
      if (outcome.stage === 'compile-error') {
        setError(outcome.message);
        return;
      }
      setOutput(outcome.result.output);
      if (!outcome.result.ok) setError('arduino-cli reported a failure — see output below.');
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
        {cliStatus?.available === false && (
          <Alert type="warning" message="arduino-cli was not found on PATH — install it to compile or upload." />
        )}
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
          <Button type="primary" loading={busy} onClick={() => runBuild(false)}>
            Compile
          </Button>
          <Button loading={busy} disabled={!port} onClick={() => runBuild(true)}>
            Upload
          </Button>
          <Button
            loading={busy}
            disabled={!port}
            onClick={() => {
              onClose();
              runDebugUpload().catch((debugError: unknown) => reportError('Failed to start debug session', debugError));
            }}
          >
            Upload (debug)
          </Button>
        </div>
        {error && <Alert type="error" message={error} />}
        {output && (
          <Input.TextArea value={output} readOnly rows={12} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        )}
      </div>
    </Modal>
  );
});

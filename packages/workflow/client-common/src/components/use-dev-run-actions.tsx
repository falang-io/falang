import type React from 'react';
import { useState } from 'react';
import { notification } from 'antd';
import { getFunctionSignature } from '@falang/workflow-compiler';
import { useWorkflowStore } from '../workflow-store-context.js';
import { RunFunctionModal } from './run-function-modal.js';
import { TriggerPayloadModal } from './trigger-payload-modal.js';

/** A function document's declared parameter count, straight from its loaded root — decides whether "Run" needs the arguments form at all. */
const countParameters = (root: Parameters<typeof getFunctionSignature>[0] | undefined): number => {
  if (!root) return 0;
  try {
    return getFunctionSignature(root).parameters.length;
  } catch {
    return 0;
  }
};

export interface IDevRunActions {
  readonly isStarting: boolean;
  readonly isDebugStarting: boolean;
  readonly isDebugging: boolean;
  readonly isLoadingDocuments: boolean;
  readonly onRun: () => void;
  readonly onDebug: () => void;
  /** The argument-form modals for Run and Debug — rendered once by the toolbar. */
  readonly modals: React.ReactNode;
}

/**
 * The "Run function"/"Debug" actions of the toolbar's dev-stand menu (ADR 0022 (private) and 0021 §5).
 * "Run" runs the active function document on the dev stand — straight away when it takes no
 * arguments, through the arguments form otherwise (or when no function is active, to pick one);
 * `LiveRunStore.startFunction` builds first if needed and terminates whatever else dev was running.
 * "Debug" is the same start flow but through `WorkflowStore.debugFunction`/`DebugSessionStore`,
 * pausing on entry only if no breakpoints are set yet, and disabled while a session is already
 * active (dev is single-pod, one execution at a time). With a trigger-function active both open
 * `TriggerPayloadModal` instead: the test event its trigger would deliver, sent as the trigger's signal.
 */
export const useDevRunActions = (): IDevRunActions => {
  const store = useWorkflowStore();
  const [liveRunOpen, setLiveRunOpen] = useState(false);
  const [debugRunOpen, setDebugRunOpen] = useState(false);
  const [triggerMode, setTriggerMode] = useState<'run' | 'debug' | null>(null);
  const activeDocument = store.activeTabId ? store.getDocument(store.activeTabId) : null;
  const initialFunctionName = activeDocument?.type === 'function' ? activeDocument.name : null;

  const isTriggerActive = activeDocument?.type === 'trigger-function';

  const start = async (
    functionName: string,
    args: readonly unknown[],
    triggerPayload?: Record<string, unknown>,
  ): Promise<boolean> => {
    const started = await store.liveRun.startFunction(functionName, args, triggerPayload);
    if (!started && store.liveRun.startError) notification.error({ message: store.liveRun.startError });
    return started;
  };

  // `DebugSessionStore.start` never rejects — a failed `adapter.start()` (a network error, "no dev
  // build to debug", …) is caught internally and surfaces as `lastError`/`status: 'terminated'`
  // instead, the same "check an error field after the awaited call" shape `LiveRunStore.startFunction`
  // already uses for its own `startError`.
  const startDebug = async (
    functionName: string,
    args: readonly unknown[],
    triggerPayload?: Record<string, unknown>,
  ): Promise<boolean> => {
    await store.debugFunction(functionName, args, triggerPayload);
    if (store.debugSession.lastError) {
      notification.error({ message: store.debugSession.lastError });
      return false;
    }
    return true;
  };

  const onRun = () => {
    if (isTriggerActive) {
      setTriggerMode('run');
      return;
    }
    if (activeDocument?.type !== 'function' || countParameters(activeDocument.data) > 0) {
      setLiveRunOpen(true);
      return;
    }
    start(activeDocument.name, []);
  };

  const onDebug = () => {
    if (isTriggerActive) {
      setTriggerMode('debug');
      return;
    }
    if (activeDocument?.type !== 'function' || countParameters(activeDocument.data) > 0) {
      setDebugRunOpen(true);
      return;
    }
    startDebug(activeDocument.name, []);
  };

  const modals = (
    <>
      <RunFunctionModal
        projectId={store.projectId}
        open={liveRunOpen}
        onClose={() => setLiveRunOpen(false)}
        initialFunctionName={initialFunctionName}
        isDevRunning={store.buildStatus === 'running'}
        fixedTarget="dev"
        onStart={start}
      />
      <RunFunctionModal
        projectId={store.projectId}
        open={debugRunOpen}
        onClose={() => setDebugRunOpen(false)}
        initialFunctionName={initialFunctionName}
        isDevRunning={store.buildStatus === 'running'}
        fixedTarget="dev"
        onStart={startDebug}
      />
      <TriggerPayloadModal
        open={triggerMode !== null && isTriggerActive}
        mode={triggerMode ?? 'run'}
        document={isTriggerActive ? (activeDocument ?? null) : null}
        onClose={() => setTriggerMode(null)}
        onStart={(payload) =>
          activeDocument
            ? (triggerMode === 'debug' ? startDebug : start)(activeDocument.name, [], payload)
            : Promise.resolve(false)
        }
      />
    </>
  );

  return {
    isStarting: store.liveRun.isStarting || store.buildStatus === 'building',
    isDebugStarting: store.debugSession.status === 'starting',
    isDebugging: store.debugSession.isActive,
    isLoadingDocuments: store.isLoadingDocuments,
    onRun,
    onDebug,
    modals,
  };
};

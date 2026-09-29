import type { IPortMonitor } from '@falang/desktop-arduino-cli';
import type { IDebugBreakpoint, IDebugMap, IDebugVariable, TDebugEvent, TDebugResumeMode } from '@falang/debug';

export interface ISerialDebugSessionParams {
  /** An already-opened serial channel (see `monitorPort` — opened by the caller, e.g. `debug-session-registry.ts`, so this class stays unit-testable with a fake `IPortMonitor` instead of a real subprocess). */
  readonly monitor: IPortMonitor;
  readonly debugMap: IDebugMap;
  readonly breakpoints: readonly IDebugBreakpoint[];
  readonly pauseOnEntry: boolean;
  readonly onEvent: (event: TDebugEvent) => void;
}

const isBreakpointLine = (line: string): boolean => line.length > 0 && line[0] === 'R';

const parseValue = (kind: string, raw: string): number | boolean => {
  if (kind === 'b') return raw === '1';
  return Number(raw);
};

/**
 * Owns the firmware-side handshake and frame parsing for one debug session (ADR 0021 (private)
 * §6) — the main-process half of the Arduino transport. `ArduinoDebugAdapter` (renderer, a thin IPC
 * shim) never sees `R`/`P`/`V` frames or trace indexes, only `TDebugEvent`s and `{documentId, nodeId}`
 * locations, resolved here through the `IDebugMap` a debug build's compile produced.
 */
export class SerialDebugSession {
  private readonly monitor: IPortMonitor;
  private readonly debugMap: IDebugMap;
  private readonly onEvent: (event: TDebugEvent) => void;
  private readonly breakpointIndexes = new Set<number>();
  private buffer = '';
  private terminated = false;
  private pausedIndex: number | null = null;
  private pausedVariables: IDebugVariable[] = [];
  /** Set only when `pauseOnEntry` requested a synthetic breakpoint on trace index 0 — cleared after the first pause, so that one pause reports `reason: 'entry'` instead of `'breakpoint'` even though it's implemented the same way on the wire. */
  private pendingEntryPause: boolean;

  constructor(params: ISerialDebugSessionParams) {
    this.debugMap = params.debugMap;
    this.onEvent = params.onEvent;
    for (const breakpoint of params.breakpoints) {
      const index = this.resolveIndex(breakpoint);
      if (index !== null) this.breakpointIndexes.add(index);
    }
    this.pendingEntryPause = params.pauseOnEntry && this.debugMap.tracePoints.length > 0;
    if (this.pendingEntryPause) this.breakpointIndexes.add(0);

    this.monitor = params.monitor;
    this.monitor.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.monitor.stdout.on('close', () => this.handleClose());
  }

  setBreakpoints(breakpoints: readonly IDebugBreakpoint[]): Promise<void> {
    const nextIndexes = new Set<number>();
    for (const breakpoint of breakpoints) {
      const index = this.resolveIndex(breakpoint);
      if (index !== null) nextIndexes.add(index);
    }
    for (const index of this.breakpointIndexes) {
      if (!nextIndexes.has(index)) this.send(`B ${String(index)} 0`);
    }
    for (const index of nextIndexes) {
      if (!this.breakpointIndexes.has(index)) this.send(`B ${String(index)} 1`);
    }
    this.breakpointIndexes.clear();
    for (const index of nextIndexes) this.breakpointIndexes.add(index);
    return Promise.resolve();
  }

  resume(mode: TDebugResumeMode): Promise<void> {
    this.pausedIndex = null;
    this.pausedVariables = [];
    this.send(mode === 'step-over' ? 'S' : 'C');
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (this.terminated) return Promise.resolve();
    this.terminated = true;
    this.monitor.kill();
    this.onEvent({ type: 'terminated', reason: 'stopped' });
    return Promise.resolve();
  }

  private resolveIndex(location: IDebugBreakpoint): number | null {
    const site = this.debugMap.tracePoints.find(
      (point) => point.documentId === location.documentId && point.nodeId === location.nodeId,
    );
    return site?.index ?? null;
  }

  private send(line: string): void {
    this.monitor.stdin.write(`${line}\n`);
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    if (isBreakpointLine(line)) {
      for (const index of this.breakpointIndexes) this.send(`B ${String(index)} 1`);
      this.send('A');
      this.onEvent({ type: 'started' });
      return;
    }
    if (line.startsWith('P ')) {
      // The trailing call-depth field isn't surfaced yet — MVP renders only the top frame (see
      // ADR 0021 (private) §2), so only the trace index is parsed out of "P <idx> <depth>".
      const [, indexText] = line.split(' ');
      const index = Number(indexText);
      this.pausedIndex = index;
      this.pausedVariables = [];
      this.emitPausedIfComplete(index);
      return;
    }
    if (line.startsWith('V ') && this.pausedIndex !== null) {
      const [, varIndexText, kind, ...rest] = line.split(' ');
      const site = this.debugMap.tracePoints[this.pausedIndex];
      const declared = site?.variables[Number(varIndexText)];
      if (declared) {
        this.pausedVariables.push({
          name: declared.name,
          type: declared.type,
          value: parseValue(kind ?? 'i', rest.join(' ')),
        });
      }
      this.emitPausedIfComplete(this.pausedIndex);
    }
  }

  private resolvePauseReason(index: number): 'entry' | 'breakpoint' | 'step' {
    if (this.pendingEntryPause) return 'entry';
    return this.breakpointIndexes.has(index) ? 'breakpoint' : 'step';
  }

  private emitPausedIfComplete(index: number): void {
    const site = this.debugMap.tracePoints[index];
    if (!site || this.pausedVariables.length < site.variables.length) return;
    const reason = this.resolvePauseReason(index);
    this.pendingEntryPause = false;
    this.onEvent({
      type: 'paused',
      location: { documentId: site.documentId, nodeId: site.nodeId },
      variables: this.pausedVariables,
      stack: [{ location: { documentId: site.documentId, nodeId: site.nodeId }, functionName: site.documentId }],
      reason,
    });
  }

  private handleClose(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.onEvent({ type: 'terminated', reason: 'completed' });
  }
}

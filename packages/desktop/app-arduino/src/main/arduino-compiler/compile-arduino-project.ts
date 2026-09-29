import type { IProjectDocument } from '@falang/dto';
import {
  buildStructRegistry,
  emitCppStructDeclarations,
  buildCppSignatureLine,
  compileCppFunction,
  getFunctionSignature,
  NodeCompileError,
  type ICppCompileParams,
  type ICppFunctionSignature,
  type IDebugCompileOptions,
} from '@falang/logic-constructor';
import type { IDebugMap, IDebugTracePoint } from '@falang/debug';
import { DEFAULT_BAUDRATE } from '@falang/desktop-arduino-cli';
import { buildArduinoAdapter } from './arduino-adapter.js';
import { ARDUINO_BUILTIN_DECLARATIONS } from '../../shared/arduino-builtins.js';
import { DEVICES_DOCUMENT_TYPE } from '../../shared/devices-document.js';
import type { IDriverConfig } from '../../shared/driver-config.js';
import { createArduinoTracer } from './arduino-tracer.js';
import { buildFalangDebugHeader } from './falang-debug-header.js';
import { lowerPinNodes } from './lower-pin-nodes.js';
import { lowerArduinoFunctionNodes } from './lower-arduino-function-nodes.js';
import { lowerDriverNodes } from './lower-driver-nodes.js';
import { buildSetupPrologue } from './setup-prologue.js';

const PREAMBLE = '#include <Arduino.h>';
const DEBUG_HEADER_INCLUDE = '#include "falang_debug.h"';
export const FALANG_DEBUG_HEADER_FILENAME = 'falang_debug.h';

/** An Arduino sketch's two required entry points — unlike `compileCppProject`'s single, caller-chosen `entryDocumentId`, both are fixed by Arduino's own convention (the toolchain calls `setup()` once, then `loop()` forever) and neither gets a synthesized `int main()` wrapper. */
const REQUIRED_ENTRY_FUNCTIONS = ['setup', 'loop'] as const;

export interface ICompileArduinoProjectParams {
  readonly documents: readonly IProjectDocument[];
  /** Opt-in trace instrumentation (ADR 0021 (private) §6) — off by default, and off for every real upload except "Build & Upload (debug)". When on, `.debugMap`/`.debugHeader` are populated on the result; the emitted `.ino` code is otherwise unaffected save for the `falang_debug.h` include and the trace calls themselves. */
  readonly debug?: boolean;
  /** The full loaded driver registry (see ADR 0023 (private)'s Phase B/C) — only drivers actually referenced by a `driver-action::…` node affect the output (`#include`s, ambient declarations); an unused entry here is harmless. Defaults to `[]` for callers/tests with no drivers (e.g. Phase A's own pin-node tests). */
  readonly drivers?: readonly IDriverConfig[];
}

export interface ICompileArduinoProjectResult {
  readonly code: string;
  /** Driver ids referenced by at least one node — `arduino-build.ts` uses this to know which drivers' source files to copy into the sketch directory. */
  readonly usedDriverIds: ReadonlySet<string>;
  /** Only set when `debug` was requested — write this alongside the `.ino` as `falang_debug.h` (see `FALANG_DEBUG_HEADER_FILENAME`; `@falang/desktop-arduino-cli`'s `writeSketchFiles` takes it as an `extraFiles` entry). */
  readonly debugHeader?: string;
  readonly debugMap?: IDebugMap;
}

export interface IArduinoProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Thrown by `compileArduinoProject` when one or more `function` documents fail to compile — the Arduino analogue of `@falang/logic-constructor`'s `CppProjectCompileError`, kept as its own class (not reused) so a caller can tell which target actually failed. Every other document's output still compiled fine (see `.partialCode`). */
export class ArduinoProjectCompileError extends Error {
  readonly errors: readonly IArduinoProjectCompileErrorEntry[];
  readonly partialCode: string;

  constructor(errors: readonly IArduinoProjectCompileErrorEntry[], partialCode: string) {
    super(
      errors
        .map(
          (error) =>
            `${error.documentName} (${error.documentId}${error.nodeId ? `, node ${error.nodeId}` : ''}): ${error.message}`,
        )
        .join('\n'),
    );
    this.name = 'ArduinoProjectCompileError';
    this.errors = errors;
    this.partialCode = partialCode;
  }
}

/**
 * `falang_debug.h`'s own doc comment and ADR 0021 (private)'s design both say `setup()` "starts
 * with `falang_wait_attach()`" — but nothing ever actually called it: `compileCppFunction`'s debug
 * mode only brackets a function body with the tracer's `emitEnter`/`emitLeave` (call-depth tracking),
 * which has no Arduino-specific knowledge of `setup` being special. Found live, on the very first
 * real-hardware pass this ADR's Phase 2 never got (no hardware/`arduino-cli` binary was available
 * during development, see the ADR): a debug build flashed and ran fine, but the debug panel hung on
 * "Starting…" forever — the firmware's `Serial` was never `begin()`un and `falang_wait_attach()` was
 * dead code, so the board never sent the `R` handshake line `SerialDebugSession` waits for. Fixed
 * here (Arduino-only assembly, not `@falang/logic-constructor`, matching this app's existing
 * "`@falang/logic-constructor` never learns the word Arduino/Serial" posture) by splicing lines into
 * `setup()`'s compiled body, right after its opening brace and before the tracer's own
 * `FalangDebugFrame` guard — `compileCppFunction`'s output shape (`buildCppSignatureLine` + ` {\n`)
 * is stable enough to splice against directly rather than re-parsing/re-emitting the function.
 *
 * Generalized (ADR 0032 (private), "Decision → 3") from a
 * debug-attach-only `injectSetupDebugAttach(setupCode, baudRate)` into a plain `(setupCode, lines)`
 * splice, since `setup()`'s prologue now has a second, unrelated source of lines to insert — a
 * project's `Devices` document (`buildSetupPrologue`, `pinMode(...)`/device-init calls). Both sets of
 * lines land in the same splice point, so the caller concatenates them in the order the ADR specifies
 * (debug-attach first, prologue second) before calling this once.
 */
const injectSetupPrologue = (setupCode: string, lines: readonly string[]): string => {
  if (lines.length === 0) return setupCode;
  const marker = 'void setup() {\n';
  const index = setupCode.indexOf(marker);
  if (index === -1) return setupCode;
  const insertPoint = index + marker.length;
  const inserted = lines.map((line) => `  ${line}\n`).join('');
  return setupCode.slice(0, insertPoint) + inserted + setupCode.slice(insertPoint);
};

/** Pulls the function name out of one `declare function name(...): T;` line — `declare const` lines (constants, not calls) are skipped. */
const extractDeclaredFunctionName = (declaration: string): string | null => {
  const match = /^declare function ([A-Za-z_]\w*)/.exec(declaration);
  return match ? match[1] : null;
};

const assertValidEntryFunction = (functionDocuments: readonly IProjectDocument[], name: string): void => {
  const document = functionDocuments.find((doc) => doc.name === name);
  if (!document) throw new Error(`Arduino sketch requires a function document named "${name}"`);
  if (!document.root) throw new Error(`Function document "${name}" has no root node`);
  const signature = getFunctionSignature(document.root);
  if (signature.parameters.length > 0) {
    throw new Error(`"${name}" must take no parameters to be used as an Arduino entry point`);
  }
  if (signature.returnValue) throw new Error(`"${name}" must return void to be used as an Arduino entry point`);
};

/**
 * Compiles every `function` document in an Arduino project into one self-contained `.ino`-ready
 * sketch (an `#include <Arduino.h>` preamble, then every function definition) — the Arduino analogue
 * of `@falang/logic-constructor`'s `compileCppProject`, built entirely in this app (see
 * ADR 0020 (private)'s "Decision" §3–4 for why the shared package stays uninvolved).
 */
export const compileArduinoProject = ({
  documents,
  debug,
  drivers = [],
}: ICompileArduinoProjectParams): ICompileArduinoProjectResult => {
  const functionLowered = lowerArduinoFunctionNodes(documents);
  const pinLowered = lowerPinNodes(functionLowered);
  const { documents: loweredDocuments, usedDriverIds: actionUsedDriverIds } = lowerDriverNodes(pinLowered, drivers);
  const functionDocuments = loweredDocuments.filter((document) => document.type === 'function');
  for (const name of REQUIRED_ENTRY_FUNCTIONS) assertValidEntryFunction(functionDocuments, name);

  // The `Devices` document (ADR 0032 (private) §3) is a `custom` document with no `root`, so both
  // lowering passes above leave it untouched — looked up straight from the caller's own `documents`,
  // independent of the pin/driver-action lowering. A non-`function`, non-`devices` document type
  // (there are none today, but the shape allows it) is simply never matched by either filter/find.
  const devicesDocument = documents.find((document) => document.type === DEVICES_DOCUMENT_TYPE);
  const { lines: setupPrologueLines, usedDriverIds: deviceUsedDriverIds } = buildSetupPrologue({
    devicesDocument,
    drivers,
  });

  // Merged *before* `usedDrivers`/`#include`s/source-file copying are computed below — a device
  // instance with no `driver-action::…` node anywhere in the project must still pull in its driver's
  // artifacts (see the ADR's "Decision → 3": "marks its driver as used ... even when no driver-action
  // node references it").
  const usedDriverIds = new Set([...actionUsedDriverIds, ...deviceUsedDriverIds]);

  const usedDrivers = drivers.filter((driver) => usedDriverIds.has(driver.id));
  const structRegistry = buildStructRegistry(loweredDocuments);

  const functionSignatures = new Map<string, ICppFunctionSignature>();
  const prototypes: string[] = [];
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    functionSignatures.set(document.id, { cppName: document.name, returnValue: signature.returnValue });
    prototypes.push(
      `${buildCppSignatureLine(document.name, signature.parameters, signature.returnValue, structRegistry.structNames)};`,
    );
  }

  const driverDeclarations = usedDrivers.flatMap((driver) => driver.declarations);
  const driverCallNames = driverDeclarations
    .map((declaration) => extractDeclaredFunctionName(declaration))
    .filter((name): name is string => name !== null);

  const params: ICppCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    functionSignatures,
    adapter: buildArduinoAdapter(driverCallNames),
    extraDeclarations: [...ARDUINO_BUILTIN_DECLARATIONS, ...driverDeclarations],
    // An Arduino sketch has no `call-api` concept (no external-API structure documents) — the
    // shared cpp statement compiler still requires this field (added by ADR 0019's `call-api` work,
    // merged after this file was first written), so it's always empty here.
    apiEndpoints: new Map(),
  };

  // A single project-wide index counter and trace-point collector, shared across every document's
  // own `compileCppFunction` call — the same "one counter, many documents" shape
  // `@falang/workflow-compiler`'s own debug-emit options use, so indexes stay dense and unique across
  // the whole sketch, not just within one function. `createArduinoTracer()` is stateless (pure text
  // emitters), so building it unconditionally costs nothing when `debug` is off — it's simply unused.
  const tracePoints: IDebugTracePoint[] = [];
  let nextTraceIndex = 0;
  const arduinoTracer = createArduinoTracer();
  const buildDebugOptions = (documentId: string): IDebugCompileOptions => ({
    tracer: arduinoTracer,
    documentId,
    allocateIndex: () => {
      const index = nextTraceIndex;
      nextTraceIndex += 1;
      return index;
    },
    onTracePoint: (site) => tracePoints.push(site),
  });

  // `setup()`'s full prologue, in the ADR's own specified order: debug-attach lines first (the board
  // must announce itself and wait for the debugger before touching any pin/device — a breakpoint on
  // the very first user statement has to be reachable), then the `Devices` document's own pin/device
  // lines. Built once, outside the per-document loop below, since neither depends on which document
  // is currently being compiled.
  const setupPrologueFullLines = [
    ...(debug ? [`Serial.begin(${String(DEFAULT_BAUDRATE)});`, 'falang_wait_attach();'] : []),
    ...setupPrologueLines,
  ];

  const errors: IArduinoProjectCompileErrorEntry[] = [];
  const functionBlocks: string[] = [];
  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      let compiled = debug
        ? compileCppFunction(document.root, document.name, params, buildDebugOptions(document.id))
        : compileCppFunction(document.root, document.name, params);
      if (document.name === 'setup') compiled = injectSetupPrologue(compiled, setupPrologueFullLines);
      functionBlocks.push(compiled);
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const structDeclarations = emitCppStructDeclarations(structRegistry.structDefinitions, structRegistry.structNames);

  const driverIncludes = usedDrivers.flatMap((driver) => driver.includes).map((fileName) => `#include "${fileName}"`);
  const preamble = [PREAMBLE, ...driverIncludes, ...(debug ? [DEBUG_HEADER_INCLUDE] : [])].join('\n');

  const code = [preamble, structDeclarations, prototypes.join('\n'), functionBlocks.join('\n\n')]
    .filter((section) => section !== '')
    .join('\n\n');

  if (errors.length > 0) throw new ArduinoProjectCompileError(errors, code);
  if (!debug) return { code, usedDriverIds };
  return { code, usedDriverIds, debugHeader: buildFalangDebugHeader(tracePoints.length), debugMap: { tracePoints } };
};

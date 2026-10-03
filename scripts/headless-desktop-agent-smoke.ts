// oxlint-disable no-console, max-lines
/**
 * Headless end-to-end smoke test for the two desktop IDEs' in-app agent (ADR 0051, agent tuner phase 0, part C): in PLAIN
 * NODE (no Electron, browser, bundler, vitest or module mocks) it builds in-memory projects, runs the REAL agent session —
 * built by the same `createDesktopAgentSession` the editors' stores call — against a scripted LLM, then compiles the result
 * with each product's real compiler:
 *
 *  - app-sketch, `logic` project: a `function` document -> `@falang/logic-constructor`'s `compileCppProject`.
 *  - app-sketch, `simple-code-ts` project: one `simple-code-ts` document -> `@falang/simple-code-export`'s `generateCode`.
 *  - app-arduino: `setup`/`loop` (+ a `Devices` document the agent must not touch), the bundled drivers loaded from
 *    `BUNDLED_DRIVERS_DIR` -> `compileArduinoProject`, and, when `arduino-cli` + the AVR core are installed, a real
 *    `arduino-cli compile --fqbn arduino:avr:uno` of the generated sketch.
 *
 * Schemes come from the editors' own builders (`buildSketchDocumentScheme`/`buildArduinoDocumentScheme`, project containers
 * from `createSketchProjectContainer`/`createArduinoProjectContainer`, document sync from `subscribeDesktopDocumentSync`);
 * the only thing this file supplies is the in-memory store (the editors' is the IPC-backed one).
 *
 * Run: `npx tsx scripts/headless-desktop-agent-smoke.ts` (or `npm run test:headless-schemes`). Exits non-zero on any failure.
 */
import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScriptedLlmClient, type AgentSession, type ILlmResponse, type TScriptedStep } from '@falang/agent';
import {
  buildArduinoDocumentScheme,
  buildSketchDocumentScheme,
  createArduinoProjectContainer,
  createDesktopAgentDocumentResolver,
  createDesktopAgentSession,
  createSketchProjectContainer,
  subscribeDesktopDocumentSync,
  syncDesktopDocumentFromScheme,
  syncSketchProjectRegistries,
  type IDesktopAgentStore,
  type SketchDocumentType,
  type TDesktopAgentProduct,
} from '@falang/desktop-agent-host';
import { checkArduinoCli, compileSketch, writeSketchFiles } from '@falang/desktop-arduino-cli';
import { collectDriverExtraFiles, compileArduinoProject } from '@falang/desktop-arduino-compiler';
import { BUNDLED_DRIVERS_DIR } from '@falang/desktop-arduino-drivers';
import {
  buildDriverActionNodeName,
  DEVICES_DOCUMENT_TYPE,
  emptyDevicesDocumentData,
  loadDriverRegistryFromDirs,
  type IDriverRegistry,
} from '@falang/desktop-arduino-dto';
import { initializeDriverRegistry } from '@falang/desktop-arduino-scheme';
import type { DependencyContainer } from '@falang/di';
import type { INode, IProjectDocument } from '@falang/dto';
import { compileCppProject } from '@falang/logic-constructor';
import { registerGlobalTokens, type Scheme } from '@falang/scheme';
import { generateCode } from '@falang/simple-code-export';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

interface IHeadlessDocument {
  id: string;
  name: string;
  type: string;
  root?: INode;
  data?: unknown;
}

/** An editor store (`DesktopProjectStore`/`ArduinoProjectStore`) with the IPC, tabs and autosave taken out: documents live in memory, schemes are the real ones. */
class HeadlessDesktopStore implements IDesktopAgentStore {
  readonly documents: IHeadlessDocument[] = [];
  readonly container: DependencyContainer;
  private readonly schemes = new Map<string, Scheme>();

  private readonly product: TDesktopAgentProduct;

  constructor(product: TDesktopAgentProduct, projectType: string) {
    this.product = product;
    this.container =
      product === 'arduino' ? createArduinoProjectContainer() : createSketchProjectContainer(projectType);
  }

  addDocument(doc: IHeadlessDocument): void {
    this.documents.push(doc);
    // The editor's project-wide registries autoruns (call-function / external-API / struct pickers) as one explicit call.
    if (this.product === 'sketch') syncSketchProjectRegistries(this.container, this.documents);
  }

  getDocument(documentId: string): IHeadlessDocument | undefined {
    return this.documents.find((doc) => doc.id === documentId);
  }

  getScheme(documentId: string): Scheme {
    const existing = this.schemes.get(documentId);
    if (existing) return existing;
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.type === DEVICES_DOCUMENT_TYPE) throw new Error(`Document ${documentId} has no scheme editor`);
    const scheme =
      this.product === 'arduino'
        ? buildArduinoDocumentScheme({ doc, parentContainer: this.container })
        : buildSketchDocumentScheme({
            doc: { ...doc, type: doc.type as SketchDocumentType },
            parentContainer: this.container,
          });
    // The editor's own sync of `doc.root` on every change (its debounced autosave is host-only).
    subscribeDesktopDocumentSync(doc, scheme);
    this.schemes.set(documentId, scheme);
    return scheme;
  }

  /** The tree the editor would save/compile: `doc.root` (kept current by the shared sync), serialized on demand for a never-edited one. */
  rootOf(doc: IHeadlessDocument): INode {
    const scheme = this.getScheme(doc.id);
    const root = syncDesktopDocumentFromScheme(doc, scheme);
    if (!root) throw new Error(`Document ${doc.name} has no root`);
    return root;
  }

  bodyIdOf(documentId: string): string {
    const body = this.getScheme(documentId).rootNode?.children.find((child) => child.name.endsWith('function-body'));
    assert(body, `document ${documentId} has no function body`);
    return body.id;
  }

  dispose(): void {
    for (const scheme of this.schemes.values()) scheme.dispose();
  }
}

const toolCall = (name: string, input: unknown, id = name): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});

/** Runs one scripted agent request through the shared factory and checks the run ended cleanly. */
const runAgent = async (
  product: TDesktopAgentProduct,
  store: HeadlessDesktopStore,
  script: TScriptedStep[],
  activeDocumentId: string,
): Promise<{ session: AgentSession; client: ScriptedLlmClient }> => {
  const client = new ScriptedLlmClient(script);
  const opened: string[] = [];
  const session = createDesktopAgentSession({
    focusPauseMs: 0,
    llmClient: client,
    onOpenDocument: (documentId) => opened.push(documentId),
    product,
    store,
  });
  const started = Date.now();
  await session.run('Build it.', { activeDocumentId });
  assert(Date.now() - started < 2000, 'run took suspiciously long — focusPauseMs: 0 should skip the pause');
  assert(session.status === 'done', `${product} agent run ended ${session.status}: ${session.error}`);
  const failed = session.steps.filter((step) => !step.result.ok);
  assert(failed.length === 0, `failed steps: ${JSON.stringify(failed.map((step) => [step.call.name, step.result]))}`);
  assert(opened.length > 0, 'onOpenDocument was not called');
  const toolNames = new Set(client.requests[0]?.tools.map((tool) => tool.name));
  for (const name of ['get_tree', 'get_node_kinds', 'insert_nodes', 'finish']) {
    assert(toolNames.has(name), `session did not offer tool ${name}`);
  }
  return { session, client };
};

const int32 = { numberType: { integerType: 'int32', type: 'integer' }, type: 'number' };

// ---------------------------------------------------------------- app-sketch: logic project

const sketchLogic = async (): Promise<void> => {
  const store = new HeadlessDesktopStore('sketch', 'logic');
  try {
    store.addDocument({ id: 'main', name: 'main', type: 'function' });
    store.addDocument({ id: 'types', name: 'Types', type: 'objects-structure' });
    const bodyId = store.bodyIdOf('main');
    await runAgent(
      'sketch',
      store,
      [
        toolCall('get_node_kinds', { documentId: 'main', parentId: bodyId }),
        toolCall('insert_nodes', {
          documentId: 'main',
          index: 0,
          node: { data: { name: 'counter', value: '1', variableType: int32 }, name: 'create-var' },
          parentId: bodyId,
        }),
        toolCall('insert_nodes', {
          documentId: 'main',
          index: 1,
          node: { data: 'counter = counter + 2', name: 'action' },
          parentId: bodyId,
        }),
        toolCall('finish', { message: 'Added a counter.' }),
      ],
      'main',
    );
    // An objects-structure document is not agent-editable in app-sketch.
    const resolver = createDesktopAgentDocumentResolver('sketch', store);
    let threw = false;
    try {
      resolver.resolve('types');
    } catch {
      threw = true;
    }
    assert(threw, 'objects-structure must not resolve for the sketch agent');
    const documents: IProjectDocument[] = store.documents
      .filter((doc) => doc.type === 'function')
      .map((doc) => ({ id: doc.id, name: doc.name, root: store.rootOf(doc), type: 'function' }));
    const cpp = compileCppProject({ documents, entryDocumentId: 'main' });
    assert(cpp.includes('counter = counter + 2'), `cpp output misses the agent-inserted action:\n${cpp}`);
    console.log('ok   app-sketch logic: agent run + compileCppProject');
  } finally {
    store.dispose();
  }
};

// ---------------------------------------------------------------- app-sketch: simple-code project

const sketchSimpleCode = async (): Promise<void> => {
  const store = new HeadlessDesktopStore('sketch', 'simple-code-ts');
  try {
    store.addDocument({ id: 'code', name: 'Main', type: 'simple-code-ts' });
    const bodyId = store.bodyIdOf('code');
    await runAgent(
      'sketch',
      store,
      [
        toolCall('get_node_kinds', { documentId: 'code', parentId: bodyId }),
        toolCall('insert_nodes', {
          documentId: 'code',
          index: 0,
          node: { data: 'const answer = 42;', name: 'action' },
          parentId: bodyId,
        }),
        toolCall('finish', { message: 'Declared the answer.' }),
      ],
      'code',
    );
    const code = generateCode(store.rootOf(store.documents[0]), 'ts');
    assert(code.includes('const answer = 42;'), `generated ts misses the agent-inserted code:\n${code}`);
    console.log('ok   app-sketch simple-code-ts: agent run + generateCode');
  } finally {
    store.dispose();
  }
};

// ---------------------------------------------------------------- app-arduino

const arduino = async (registry: IDriverRegistry): Promise<void> => {
  const store = new HeadlessDesktopStore('arduino', 'arduino');
  const tmp = await mkdtemp(join(tmpdir(), 'falang-headless-arduino-'));
  try {
    store.addDocument({ id: 'setup', name: 'setup', type: 'function' });
    store.addDocument({ id: 'loop', name: 'loop', type: 'function' });
    store.addDocument({
      data: emptyDevicesDocumentData(),
      id: 'devices',
      name: 'Devices',
      type: DEVICES_DOCUMENT_TYPE,
    });
    const { client } = await runAgent(
      'arduino',
      store,
      [
        toolCall('get_node_kinds', { documentId: 'setup', parentId: store.bodyIdOf('setup') }),
        toolCall('insert_nodes', {
          documentId: 'setup',
          index: 0,
          node: { data: { pin: 13, value: true }, name: 'pin-write-digital' },
          parentId: store.bodyIdOf('setup'),
        }),
        toolCall('insert_nodes', {
          documentId: 'loop',
          index: 0,
          node: {
            data: { echoPin: '10', trigPin: '9', variable: 'distanceCm' },
            name: buildDriverActionNodeName('hc-sr04', 'read-distance'),
          },
          parentId: store.bodyIdOf('loop'),
        }),
        toolCall('finish', { message: 'Set pin 13 high and read the distance.' }),
      ],
      'setup',
    );
    const kinds = client.requests[1]?.messages.map((message) => JSON.stringify(message)).join('\n') ?? '';
    assert(
      kinds.includes('pin-write-digital') && kinds.includes('driver-action::hc-sr04::read-distance'),
      'get_node_kinds did not list the Arduino pin / driver-action node kinds',
    );
    // The Devices document has no Scheme and is not agent-editable.
    let threw = false;
    try {
      createDesktopAgentDocumentResolver('arduino', store).resolve('devices');
    } catch {
      threw = true;
    }
    assert(threw, 'the Devices document must not resolve for the arduino agent');

    const documents: IProjectDocument[] = store.documents.map((doc) =>
      doc.type === DEVICES_DOCUMENT_TYPE
        ? { data: doc.data, id: doc.id, name: doc.name, type: doc.type }
        : { id: doc.id, name: doc.name, root: store.rootOf(doc), type: doc.type },
    );
    const compiled = compileArduinoProject({ documents, drivers: registry.drivers.map((driver) => driver.config) });
    assert(compiled.code.includes('digitalWrite(13'), `sketch misses the pin write:\n${compiled.code}`);
    assert(compiled.code.includes('hcsr04_read_distance(9, 10)'), `sketch misses the driver call:\n${compiled.code}`);
    assert(compiled.usedDriverIds.has('hc-sr04'), 'hc-sr04 driver not recorded as used');
    console.log('ok   app-arduino: agent run (pin + driver action) + compileArduinoProject');

    const cli = await checkArduinoCli();
    if (!cli.available) {
      console.log('skip arduino-cli compile: arduino-cli is not installed');
      return;
    }
    const sketchDir = await writeSketchFiles(
      tmp,
      'sketch',
      compiled.code,
      collectDriverExtraFiles(registry.drivers, compiled.usedDriverIds),
    );
    const result = await compileSketch({ fqbn: 'arduino:avr:uno', sketchDir });
    if (!result.ok && /platform not installed|Unknown FQBN|No such core/iu.test(result.output)) {
      console.log(`skip arduino-cli compile: AVR core not installed (${result.output.split('\n')[0]})`);
      return;
    }
    assert(result.ok, `arduino-cli compile failed:\n${result.output}`);
    console.log(`ok   arduino-cli compile --fqbn arduino:avr:uno (${cli.version?.split('\n')[0] ?? 'arduino-cli'})`);
  } finally {
    store.dispose();
    await rm(tmp, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  registerGlobalTokens();
  const registry = await loadDriverRegistryFromDirs([BUNDLED_DRIVERS_DIR]);
  assert(registry.errors.length === 0, `bundled drivers failed to load: ${JSON.stringify(registry.errors)}`);
  assert(registry.drivers.length >= 6, `expected the six bundled drivers, got ${registry.drivers.length}`);
  initializeDriverRegistry(registry.drivers.map((driver) => driver.config));
  await sketchLogic();
  await sketchSimpleCode();
  await arduino(registry);
};

main().then(
  () => {
    console.log('\nAll headless desktop agent checks passed');
  },
  (error: unknown) => {
    console.error('FAIL', error);
    process.exitCode = 1;
  },
);

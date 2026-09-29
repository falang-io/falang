import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listTree, readDocument, type IProjectTree } from '@falang/desktop-project-fs';
import { NodesStack, type INode, type IProjectDocument, type IProjectTreeDocument } from '@falang/dto';
import { getTextGroup } from '@falang/text-dto';
import {
  enumStructureNodes,
  externalApiStructureNodes,
  functionNodesGroup,
  objectStructureNodes,
} from '@falang/typescript-dto';
import { codeFunctionNodesGroup } from '@falang/simple-code-dto';
import { convertOldProject } from './convert-project.js';
import { isOldFormatProject } from './detect.js';
import { copyFixtureToTmpDir } from './test-utils.js';

const textStack = new NodesStack([getTextGroup()]);
const logicStack = new NodesStack([
  functionNodesGroup,
  objectStructureNodes,
  externalApiStructureNodes,
  enumStructureNodes,
]);
const codeStack = new NodesStack([codeFunctionNodesGroup]);

/** Recursively asserts every document in the project parses through the given `NodesStack` — the same validation `schemeFactory({ document })` runs when a document is actually opened. */
const expectAllDocumentsValid = async (projectDir: string, stack: NodesStack): Promise<void> => {
  const tree = await listTree(projectDir);
  const documents = await Promise.all(tree.documents.map((entry) => readDocument(projectDir, entry.id)));
  for (const document of documents) {
    expect(() => stack.parseNode(document.root), `document "${document.name}" (${document.id})`).not.toThrow();
  }
};

const requireDocumentEntry = (tree: IProjectTree, name: string): IProjectTreeDocument => {
  const entry = tree.documents.find((d) => d.name === name);
  if (!entry) throw new Error(`Fixture is missing an expected document named "${name}"`);
  return entry;
};

const readDocumentByName = (projectDir: string, tree: IProjectTree, name: string): Promise<IProjectDocument> =>
  readDocument(projectDir, requireDocumentEntry(tree, name).id);

const findNode = (root: INode, predicate: (node: INode) => boolean): INode | null => {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return root.out ? findNode(root.out, predicate) : null;
};

const isCreateVarNamed = (n: INode, name: string): boolean =>
  n.name === 'create-var' && (n.data as { name?: string } | undefined)?.name === name;

const requireNode = (root: INode, predicate: (node: INode) => boolean): INode => {
  const found = findNode(root, predicate);
  if (!found) throw new Error('Expected node not found in converted tree');
  return found;
};

describe('convertOldProject', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('converts the "text" fixture into a valid contour project, preserving link references', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    await convertOldProject(projectDir);

    expect(await isOldFormatProject(projectDir)).toBe(false);
    expect(await fs.readdir(path.join(projectDir, 'backup', 'falang', 'schemas'))).toContain('Main.falang.json');
    await expectAllDocumentsValid(projectDir, textStack);

    const tree = await listTree(projectDir);
    expect(tree.documents.map((d) => d.type)).toEqual(['contour', 'contour']);
    const goToStreet = requireDocumentEntry(tree, 'goToStreet');

    const mainDoc = await readDocumentByName(projectDir, tree, 'Main');
    const link = requireNode(mainDoc.root as INode, (n) => n.name === 'link');
    expect(link.data).toEqual({ documentId: goToStreet.id });
  });

  it('converts the "console_js" fixture into a valid simple-code-js project', async () => {
    projectDir = await copyFixtureToTmpDir('console_js');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, codeStack);
    const tree = await listTree(projectDir);
    expect(tree.documents.map((d) => d.type)).toEqual(['simple-code-js', 'simple-code-js']);

    const mainDoc = await readDocumentByName(projectDir, tree, 'Main');
    const root = mainDoc.root as INode;
    const body = root.children?.[1];
    expect(body?.name).toBe('code-function-body');
    expect(body?.data).toBe('exports.main = function()');
    const foreach = requireNode(root, (n) => n.name === 'foreach');
    expect(foreach.data).toBe('for (let i = 1; i <= 10; i++)');
  });

  it('converts the "objects" fixture, preserving struct id references between documents', async () => {
    projectDir = await copyFixtureToTmpDir('objects');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    expect(tree.documents.some((d) => d.type === 'objects-structure')).toBe(true);
    expect(tree.documents.some((d) => d.type === 'function')).toBe(true);

    const objects1Doc = await readDocumentByName(projectDir, tree, 'Objects1');
    const objAThread = requireNode(
      objects1Doc.root as INode,
      (n) => n.name === 'objects-structure-thread' && n.data === 'ObjA',
    );

    // ObjectCreation's `create_var` declares a struct-typed variable referencing ObjA by id — that id must be the
    // *thread node's own id* (structurally reused, see `variable-type.ts`'s module doc), not a stale/regenerated one.
    const objectCreationDoc = await readDocumentByName(projectDir, tree, 'ObjectCreation');
    const createVar = requireNode(objectCreationDoc.root as INode, (n) => n.name === 'create-var');
    expect((createVar.data as { variableType: unknown }).variableType).toEqual({
      type: 'struct',
      id: objAThread.id,
      constant: false,
      optional: false,
    });

    // `main`'s `call_function` nodes target other documents by the old *root icon's* id
    // (`IOldScheme.root.id`), not by the old document's own id — `data.schemeId` on the new
    // `call-function` node must be rewritten to the new *document's own id* (`ObjectCreation`'s, in
    // this case, the target of `main`'s first `call_function`), matching `FunctionsRegistryStore`'s
    // own `doc.id` keying (see `convert-logic-leaf.ts`'s `convertCall`). Old node id preserved 1:1
    // (`P1RfxO15_EDDI8DQLlC0c`, confirmed against the fixture's own raw JSON), so it's addressed
    // directly rather than by the generic "first call-function" `requireNode` helper above (`main` has
    // several, targeting different documents).
    const mainDoc = await readDocumentByName(projectDir, tree, 'main');
    const callFunction = requireNode(mainDoc.root as INode, (n) => n.id === 'P1RfxO15_EDDI8DQLlC0c');
    expect(callFunction.name).toBe('call-function');
    const objectCreationEntry = requireDocumentEntry(tree, 'ObjectCreation');
    expect((callFunction.data as { schemeId: string }).schemeId).toBe(objectCreationEntry.id);
  });

  it('converts the "conditions" fixture, applying the from-to-cycle inclusive-bound and return-value-merge transforms', async () => {
    projectDir = await copyFixtureToTmpDir('conditions');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);

    const testBreakDoc = await readDocumentByName(projectDir, tree, 'TestBreak');
    const cycle = requireNode(testBreakDoc.root as INode, (n) => n.name === 'from-to-cycle');
    // Old `{from:"0", to:"4"}` (exclusive) → new `{from:"0", to:"4 - 1"}` (inclusive), same range.
    expect(cycle.data).toEqual({ from: '0', to: '4 - 1', item: 'x' });

    const testReturnDoc = await readDocumentByName(projectDir, tree, 'TestReturn');
    const testReturnRoot = testReturnDoc.root as INode;
    // The nested early return merges its preceding `returnValue = x + y` assignment into the return's own data.
    const returnNode = requireNode(testReturnRoot, (n) => n.name === 'return');
    expect(returnNode.data).toBe('x + y');
    // ...and that assignment must be gone as a standalone statement (not left behind as dead code).
    const strayAssignment = findNode(testReturnRoot, (n) => n.name === 'action' && n.data === 'returnValue = x + y');
    expect(strayAssignment).toBeNull();
    // No synthetic top-level return was appended (the body's own top-level flow only ever exits through the
    // nested early return above) — matches `packages/logic/e2e-tests/src/conditions-project.fixture.ts`'s own
    // hand-written equivalent, which also has no trailing top-level return.
    const functionBody = testReturnRoot.children?.[1];
    expect(functionBody?.children?.at(-1)?.name).toBe('from-to-cycle');

    // A branch that returns with no preceding `returnValue = ...` assignment at all (old codegen
    // always pre-declares `returnValue` with a type-appropriate default at function entry, so this
    // is a normal fallthrough, not a converter error — see `mergeTrailingReturnValueAssignment`).
    //
    // Both of the old `if`'s branches unconditionally return — `@falang/dto` forbids `out` on
    // `if.children[0]`, so the converter (`fixIfFirstBranchOut`) keeps slot 1's own `out` unchanged
    // and hoists slot 0's `return false` into a plain trailing statement right after the `if`, safe
    // because slot 1 always exits (nothing else can reach that hoisted statement).
    const defaultDoc = await readDocumentByName(projectDir, tree, 'TestReturnDefault');
    const defaultRoot = defaultDoc.root as INode;
    const ifNode = requireNode(defaultRoot, (n) => n.name === 'if');
    const [falseBranch, trueBranch] = ifNode.children as [INode, INode];
    expect(falseBranch.out).toBeUndefined();
    expect(trueBranch.out?.name).toBe('return');
    expect(trueBranch.out?.data).toBe('true');

    const defaultFunctionBody = defaultRoot.children?.[1];
    const hoistedReturn = defaultFunctionBody?.children?.at(-1);
    expect(hoistedReturn?.name).toBe('return');
    expect(hoistedReturn?.data).toBe('false');
  });

  it('converts the "MonteCarlo" fixture, appending an explicit return for the natural end-of-function case', async () => {
    projectDir = await copyFixtureToTmpDir('MonteCarlo');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    const calcDoc = await readDocumentByName(projectDir, tree, 'calculateMonteCarlo');
    const functionBody = (calcDoc.root as INode).children?.[1];
    const last = functionBody?.children?.at(-1);
    expect(last?.name).toBe('return');
    expect(last?.data).toBe('pi');

    // MonteCarlo's own expressions exercise both the `^` (pow) and bare-whitelisted-function-call
    // (`random()`) mathjs-to-TypeScript translations (`convert-expression.ts`) for real, not just
    // through direct `convertExpression` unit tests — `create_var{"r2 = r ^ 2"}` and
    // `create_var{"y = random() * r * 2 - r"}`.
    const r2Var = findNode(functionBody as INode, (n) => isCreateVarNamed(n, 'r2'));
    expect((r2Var?.data as { value?: string } | undefined)?.value).toBe('Math.pow(r, 2)');
    const yVar = findNode(functionBody as INode, (n) => isCreateVarNamed(n, 'y'));
    expect((yVar?.data as { value?: string } | undefined)?.value).toBe('Math.random() * r * 2 - r');
  });

  it('converts the "snake-v2" fixture, translating mathjs\' "and" to "&&" in every expression that uses it', async () => {
    projectDir = await copyFixtureToTmpDir('snake-v2');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    const hasExpr = (root: INode, text: string): boolean => findNode(root, (n) => n.data === text) !== null;

    // Real "and"-using expressions from the old-format fixture (see this package's own
    // ADR 0005 (private) bullet and `convert-expression.ts`'s module doc
    // for why a real `mathjs` parse+reprint isn't used here) — every one of these must come out with
    // `&&` and, crucially, with everything else about the text unchanged (no reformatting).
    const mainDocument = await readDocumentByName(projectDir, tree, 'main');
    const mainDoc = mainDocument.root as INode;
    expect(hasExpr(mainDoc, 'state.snake.dirX == 0 && state.snake.dirY == 0')).toBe(true);
    expect(hasExpr(mainDoc, 'state.snake.x == state.food.x && state.snake.y == state.food.y')).toBe(true);
    // Untouched, irregularly-spaced assignment survives conversion byte for byte alongside the
    // translated siblings above — confirms the converter isn't reformatting expressions wholesale.
    expect(hasExpr(mainDoc, 'state.snake.x =nextPoint.x')).toBe(true);

    const isGameOverDocument = await readDocumentByName(projectDir, tree, 'isGameOver');
    const isGameOverDoc = isGameOverDocument.root as INode;
    expect(hasExpr(isGameOverDoc, 'state.snake.dirX == 0 && state.snake.dirY == 0')).toBe(true);
    expect(hasExpr(isGameOverDoc, 'item.x == state.snake.x && item.y == state.snake.y')).toBe(true);

    const getNewFoodPointDocument = await readDocumentByName(projectDir, tree, 'getNewFoodPoint');
    const getNewFoodPointDoc = getNewFoodPointDocument.root as INode;
    expect(hasExpr(getNewFoodPointDoc, 'newFoodPoint.x == bodyItem.x && newFoodPoint.y == bodyItem.y')).toBe(true);
  });

  it('converts the "api" fixture into a valid project including external-api-structure documents', async () => {
    projectDir = await copyFixtureToTmpDir('api');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    expect(tree.documents.some((d) => d.type === 'external-api-structure')).toBe(true);

    const test1Doc = await readDocumentByName(projectDir, tree, 'Test1');
    const callApi = requireNode(test1Doc.root as INode, (n) => n.name === 'call-api');
    const data = callApi.data as { parameters: unknown; returnVariable: unknown; schemeId: unknown };
    expect(data.parameters).toEqual(['a', 'b']);
    expect(data.returnVariable).toBe('result');
    // Old `call_api`'s `block.schemeId` is the target `external-api-structure` document's old *root
    // icon's* id, not its own document id — `data.schemeId` must be rewritten to the new *document's
    // own id* (`Api1`'s), matching `ExternalApiRegistryStore`'s own `doc.id` keying used by the
    // call-api editor's "api" picker (see `convert-logic-leaf.ts`'s `convertCall`, and the desktop
    // app's `syncExternalApiRegistry`).
    const api1Entry = requireDocumentEntry(tree, 'Api1');
    expect(data.schemeId).toBe(api1Entry.id);
  });

  it('converts the "arrays" fixture, renaming arr_push/arr_unshift\'s value field', async () => {
    projectDir = await copyFixtureToTmpDir('arrays');
    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    const testPushDoc = await readDocumentByName(projectDir, tree, 'TestPush');
    const arrPush = requireNode(testPushDoc.root as INode, (n) => n.name === 'arr-push');
    expect(arrPush.data).toEqual({ arr: 'arr', value: '5' });
  });

  it('rolls back automatically, restoring the original project, when a document fails to convert', async () => {
    projectDir = await copyFixtureToTmpDir('conditions');
    // Corrupt one document so `convertDocumentOrThrow` throws partway through the batch (after at
    // least one other document has already been created) — the exact "gets stuck half-converted"
    // shape this rollback exists for.
    const brokenDocPath = path.join(projectDir, 'falang', 'schemas', 'TestBreak.falang.json');
    const broken = JSON.parse(await fs.readFile(brokenDocPath, 'utf8')) as { root: { block?: { name?: string } } };
    delete broken.root.block?.name;
    await fs.writeFile(brokenDocPath, JSON.stringify(broken));
    const before = await fs.readFile(brokenDocPath, 'utf8');

    await expect(convertOldProject(projectDir)).rejects.toThrow(/TestBreak/);

    // The project directory is back to exactly its pre-conversion (old-format) state: no leftover
    // `falang.json`/`falang/schemes/` from the partial attempt, no `backup/` left behind either.
    expect(await isOldFormatProject(projectDir)).toBe(true);
    expect(await fs.readdir(projectDir)).not.toContain('backup');
    expect(await fs.readdir(projectDir)).not.toContain('falang.json');
    expect(await fs.readFile(brokenDocPath, 'utf8')).toBe(before);
  });
});

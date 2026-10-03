import { getMonaco, isMonacoInstalled } from '../get-monaco.js';

let probeCounter = 0;

/**
 * The probe file: `__FalangProbe` is the type in question; the assignment type-checks only when it
 * is `string` (or a union of string literals) — not `any`, not `never`, not anything wider.
 */
export const buildStringTypeProbe = (scopeCode: string, typeExpression: string): string =>
  `${scopeCode}\ntype __FalangProbe = ${typeExpression};\n` +
  'const __falangIsString: [__FalangProbe] extends [never] ? false : 0 extends 1 & __FalangProbe ? false : ' +
  '[__FalangProbe] extends [string] ? true : false = true;\nexport {};\n';

/**
 * Asks Monaco's TypeScript worker whether `typeExpression` (e.g. an array's element type query)
 * resolves to `string` in the given scope. `true`/`false` once the language service answered,
 * `null` when it can't (no Monaco installed — a headless host —, or the worker failed); a type that
 * doesn't resolve (an unknown variable) is `false`.
 */
export const probeIsStringType = async (scopeCode: string, typeExpression: string): Promise<boolean | null> => {
  if (!isMonacoInstalled()) return null;
  const monaco = getMonaco();
  probeCounter += 1;
  const uri = monaco.Uri.parse(`file:///__falang-string-probe-${probeCounter}.ts`);
  const model = monaco.editor.createModel(buildStringTypeProbe(scopeCode, typeExpression), 'typescript', uri);
  try {
    const getWorker = await monaco.typescript.getTypeScriptWorker();
    const worker = await getWorker(uri);
    const fileName = uri.toString();
    const [syntactic, semantic] = await Promise.all([
      worker.getSyntacticDiagnostics(fileName),
      worker.getSemanticDiagnostics(fileName),
    ]);
    return syntactic.length === 0 && semantic.length === 0;
  } catch {
    return null;
  } finally {
    model.dispose();
  }
};

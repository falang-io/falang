/**
 * A deliberately minimal replacement for `lib.ts`, used instead of it when editing an expression that
 * `@falang/logic-constructor` will compile to more than just `ts`/`js` (the "logic" project type in
 * `app-sketch`, and every Arduino sketch in `app-arduino` — see `getMonaco`'s `libVariant` parameter).
 *
 * Unlike `ts`/`js` (an identity/`ts.transpileModule` pass — any valid TypeScript is "supported"), the
 * `cpp`/`golang`/`rust`/`sharp` targets only ever emit what `walk-expression.ts` can walk and what each
 * target's own adapter (`languages/{cpp,golang,rust,sharp}-adapter.ts`) explicitly maps — anything else
 * throws `UnsupportedConstructError` at export time. `app-arduino` layers its own further ambient
 * globals (`digitalWrite`/`millis`/`Serial`/pin constants/…) on top of this via `setMonacoLibVariant`'s
 * `extraDeclarations` parameter rather than editing this file — see that function's own doc comment.
 * This file declares only that supported surface, so the editor's autocomplete/type-checking doesn't
 * lie about what will actually compile: no `Promise`,
 * `JSON`, `RegExp` (as a value), `Symbol`, `Map`/`Set`, `Proxy`/`Reflect`, generators, `Date`, or any
 * free function (`parseInt`, `console`, …) — none of these appear in any adapter's `CALL_MAP`. `Math` is
 * trimmed to exactly the 9 methods every adapter whitelists (`pow`/`abs`/`min`/`max`/`sqrt`/`floor`/
 * `ceil`/`round`/`random` — confirmed identical across all four adapters); `Array`/`String` are trimmed
 * to `length` + indexing (the only property every adapter's `emitPropertyAccess` allows, via
 * `isArrayLikeType`/`isStringLikeType` in `type-utils.ts` — anything else, e.g. `.push`/`.slice`/
 * `.toUpperCase`, is a real DSL node kind instead, never raw expression syntax). `Boolean`/`Function`/
 * `CallableFunction`/`NewableFunction`/`IArguments`/`Object`/`Number`/`RegExp` are declared as empty
 * shells purely because `ts.createProgram({ noLib: true, strict: true })` hard-requires these global
 * types to exist at all (`Cannot find global type '...'`) regardless of whether anything in scope
 * actually uses them — verified empirically, not from memory of the TS source.
 *
 * Keep this in sync with `@falang/logic-constructor`'s adapters by hand — there's no single source of
 * truth to generate it from (the adapters key `CALL_MAP` by qualified callee text, not by a type).
 */
export const libPortable = `
/// <reference no-default-lib="true"/>

interface Boolean {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {}
interface Object {}
interface Number {}
interface RegExp {}

interface String {
    readonly length: number;
    readonly [index: number]: string;
}

interface Array<T> {
    readonly length: number;
    [index: number]: T;
}

interface ReadonlyArray<T> {
    readonly length: number;
    readonly [index: number]: T;
}

/** Exactly the 9 \`Math.*\` calls every non-\`ts\`/\`js\` adapter's \`CALL_MAP\` whitelists. */
interface Math {
    pow(x: number, y: number): number;
    abs(x: number): number;
    min(...values: number[]): number;
    max(...values: number[]): number;
    sqrt(x: number): number;
    floor(x: number): number;
    ceil(x: number): number;
    round(x: number): number;
    random(): number;
}
declare var Math: Math;
`;

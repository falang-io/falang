// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta (same posture as compile-expression.ts's own VIRTUAL_PATH).
import * as path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IProjectDocument } from '@falang/dto';
import { compileRustProject } from './compile-rust-project.js';

/**
 * The same real, hand-authored "snake" project fixture `compile-ts-project.typecheck.test.ts` uses
 * (`__fixtures__/snake/documents/`, see that file's own top comment for the fixed `and`/`or` bug and
 * why it's a self-contained copy rather than reading `/home/serginho/Work/example-snake` off disk at
 * test time) — reused here rather than duplicated, since ADR 0019 (private)'s "Rust target — old-app
 * layout" pass exercises the exact same node kinds this project's documents use (`while`/`if`/
 * `foreach`/`from-to-cycle`/`pseudo-cycle`/`arr-push`/`arr-unshift`/`arr-pop`/`create-var`/
 * `call-function`/`call-api`/struct assignment/struct return values). This is a structural smoke test,
 * not a real `rustc`/`cargo build` — that's the Docker-backed `npm run test-e2e-logic` harness and the
 * manual host-crate build documented in this ADR's own "Rust target — old-app layout" implementation
 * notes; this test only asserts the compiler doesn't throw on the real project shape and spot-checks a
 * handful of load-bearing output details a structural regression would break silently otherwise.
 */
const FIXTURE_DOCUMENTS_DIR = path.join(__dirname, '__fixtures__', 'snake', 'documents');

const loadSnakeDocuments = (): readonly IProjectDocument[] =>
  readdirSync(FIXTURE_DOCUMENTS_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .map(
      (fileName) => JSON.parse(readFileSync(path.join(FIXTURE_DOCUMENTS_DIR, fileName), 'utf8')) as IProjectDocument,
    );

/**
 * A generous timeout, not a performance target — `resolveRustArrayType` (`rust-statement-context.ts`)
 * spins up a fresh `ts.Program` per `arr-*`/`foreach` node to resolve a property-path array type, and
 * this project has several; under a full-suite parallel run (many worker processes competing for CPU)
 * the default 30s budget was seen to time out even though this passes comfortably in well under 20s
 * run in isolation.
 */
const SMOKE_TEST_TIMEOUT_MS = 60_000;

describe('compileRustProject: real-project smoke test (ADR 0019 (private), "Rust target — old-app layout")', () => {
  it(
    "compiles the snake project's every document into the expected per-document file layout without throwing",
    () => {
      const documents = loadSnakeDocuments();
      const { files } = compileRustProject({ documents });

      expect(Object.keys(files)).toEqual(
        expect.arrayContaining([
          'mod.rs',
          'falang_global.rs',
          'State.rs',
          'main.rs',
          'getNextPoint.rs',
          'DrawFood.rs',
          'isGameOver.rs',
        ]),
      );

      // mod.rs: file attributes first, one pub mod per function/objects-structure document.
      expect(files['mod.rs']).toContain(
        '#![allow(non_snake_case, unused_mut, unused_variables, dead_code, unused_must_use, unreachable_code)]',
      );
      expect(files['mod.rs']).toContain('pub mod falang_global;');
      expect(files['mod.rs']).toContain('pub mod State;');
      expect(files['mod.rs']).toContain('pub mod main;');

      // falang_global.rs: the flattened Apis trait, named <ApiDoc>_<Group>_<Endpoint>.
      expect(files['falang_global.rs']).toContain('pub trait Apis {');
      expect(files['falang_global.rs']).toContain('fn GameApi_Drawing_DrawRect(&mut self');
      expect(files['falang_global.rs']).toContain('fn GameApi_Application_GetButtonsState(&mut self)');

      // State.rs: pub structs, pub fields, fully-qualified nested struct field types.
      expect(files['State.rs']).toContain('pub struct Point {');
      expect(files['State.rs']).toContain('pub x: i32,');
      expect(files['State.rs']).toContain('pub body: alloc::vec::Vec<crate::falang::State::Point>,');

      // main.rs: every function takes _apis last, struct params are & references, call-function/call-api
      // are threaded through _apis and the fully-qualified crate::falang::<Doc>::<fn> path.
      expect(files['main.rs']).toContain('_apis: &mut dyn crate::falang::falang_global::Apis');
      expect(files['main.rs']).toContain('crate::falang::getColors::getColors(_apis)');
      expect(files['main.rs']).toContain('_apis.GameApi_Application_Sleep();');
      // state.snake.body.push(...) — a property-path arr-push target, not a plain identifier; a real
      // gap `resolveRustArrayType` (`rust-statement-context.ts`) fixed over the previous plain-identifier
      // -only restriction (see that function's own doc comment).
      expect(files['main.rs']).toContain('state.snake.body.push(');
      // state.snake.body = [newSnakePoint] — a TS array literal assigned into an array-typed field, only
      // portable to Rust via the new `emitArrayLiteral` adapter hook (`languages/rust-adapter.ts`).
      expect(files['main.rs']).toContain('state.snake.body = alloc::vec![');

      // getNextPoint.rs: a struct param by & reference, a struct returned by value.
      expect(files['getNextPoint.rs']).toContain(
        'pub fn getNextPoint(state: &crate::falang::State::GameState, _apis: &mut dyn crate::falang::falang_global::Apis) -> crate::falang::State::Point',
      );
    },
    SMOKE_TEST_TIMEOUT_MS,
  );
});

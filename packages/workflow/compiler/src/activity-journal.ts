import type { IActivityJournalSpec, IWorkflowIntegration } from '@falang/workflow-integrations-common';

/** What the compiler exports from `activities.ts` for the runner's journal wrapper — see `RUN_JOURNAL_CONTRACT` §4. */
export interface IActivityJournalMetadata {
  /** Activity function name -> spec (only activities of used vendors that declare `journal`). */
  readonly journal: Readonly<Record<string, { kind: string; args: string[]; result?: boolean }>>;
  /** Activity function name -> ordered parameter names (parsed from `activitySignature`), for the same activities. */
  readonly params: Readonly<Record<string, string[]>>;
}

const OPENING = new Set(['(', '{', '[', '<']);
const CLOSING = new Set([')', '}', ']', '>']);

/**
 * Ordered parameter names of an `activitySignature` (`'name(a: string, b?: { x: number; y: string }): Promise<…>'`).
 * Walks the parameter list tracking bracket depth (inlined object/array/generic types contain commas and
 * `=>` arrows must not close an angle bracket), splitting on top-level commas; a name is the leading
 * identifier before `:`/`?:`.
 */
export const parseActivityParamNames = (signature: string): string[] => {
  const open = signature.indexOf('(');
  if (open === -1) throw new Error(`Activity signature has no parameter list: ${signature}`);
  const names: string[] = [];
  let depth = 0;
  let current = '';
  const flush = (): void => {
    const match = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(current);
    if (match) names.push(match[1]);
    else if (current.trim() !== '') throw new Error(`Cannot parse parameter "${current.trim()}" in: ${signature}`);
    current = '';
  };
  for (let index = open + 1; index < signature.length; index += 1) {
    const char = signature[index];
    if (char === '=' && signature[index + 1] === '>') {
      current += '=>';
      index += 1;
      continue;
    }
    if (depth === 0 && char === ')') {
      flush();
      return names;
    }
    if (depth === 0 && char === ',') {
      flush();
      continue;
    }
    if (OPENING.has(char)) depth += 1;
    else if (CLOSING.has(char)) depth -= 1;
    current += char;
  }
  throw new Error(`Unbalanced parameter list in activity signature: ${signature}`);
};

const parseActivityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

/**
 * Collects the run-journal metadata of the given (already used-only) integrations: every action, choice and
 * question ASK activity that declares `journal`. Throws when a `journal.args` name is not a parameter of the
 * activity (a descriptor bug that would otherwise silently drop data from every entry).
 */
export const collectActivityJournal = (integrations: readonly IWorkflowIntegration[]): IActivityJournalMetadata => {
  const journal: Record<string, { kind: string; args: string[]; result?: boolean }> = {};
  const params: Record<string, string[]> = {};
  const add = (signature: string, spec: IActivityJournalSpec | undefined): void => {
    if (!spec) return;
    const name = parseActivityName(signature);
    const names = parseActivityParamNames(signature);
    for (const arg of spec.args) {
      if (!names.includes(arg)) {
        throw new Error(`Activity "${name}": journal arg "${arg}" is not a parameter (${names.join(', ')})`);
      }
    }
    params[name] = names;
    journal[name] = {
      kind: spec.kind,
      args: [...spec.args],
      ...(typeof spec.result === 'boolean' ? { result: spec.result } : {}),
    };
  };
  for (const integration of integrations) {
    for (const action of integration.actions) add(action.activitySignature, action.journal);
    for (const question of integration.questions ?? []) add(question.askActivitySignature, question.journal);
    for (const choice of integration.choices ?? []) add(choice.activitySignature, choice.journal);
  }
  return { journal, params };
};

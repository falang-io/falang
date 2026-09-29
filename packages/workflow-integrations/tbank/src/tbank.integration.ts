import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { TBANK_GET_STATEMENT_NAME, TBANK_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * Т-Банк (T-API) — corporate banking, P1 in ADR 0017 (private).
 * The ADR's own "Т-Банк findings" section stopped short of writing any code: production access is a
 * static long-lived Bearer token (not OAuth2 at all) *plus* a client TLS certificate for "protected"
 * methods — mTLS plumbing nothing in this repo's `runner`/`compile-activities` pipeline supports
 * today (no `fetch`/undici `Agent`/`dispatcher` threaded through anywhere), deliberately left as its
 * own design pass rather than guessed at here.
 *
 * This package is the **sandbox-only MVP** that section flagged as buildable without touching that
 * gap at all. Verified against T-Bank's own dev portal (2026-09-16, `developer.tbank.ru`) before
 * coding, same "check first, don't assume" pass every other vendor in this ADR got:
 * - The sandbox needs **no credential of any kind** — no token, no certificate
 *   ("Для подключения к песочнице не нужны доступы и сертификат"). Authorization is always the
 *   literal, publicly-documented `Bearer TBankSandboxToken` — the same value for every caller, not a
 *   per-user secret — so `credentialFields` is deliberately empty, same reasoning as
 *   `httpRequestIntegration`'s "no external provider to encrypt a secret for".
 * - Sandbox requests go to the *same* host as production (`business.tbank.ru`) but under an
 *   `/openapi/sandbox` path prefix (e.g. `.../openapi/sandbox/api/v1/company`), not a separate host.
 * - `GET /api/v1/bank-statement` — the endpoint the ADR's own findings section named as sandbox's
 *   "documented example" — is marked **deprecated** on the current dev portal. Built against
 *   `GET /api/v1/statement` instead (its documented, non-deprecated replacement:
 *   `accountNumber`/`from`/`to` query params, `Authorization: Bearer <token>`), rather than building
 *   against a method the vendor's own docs say not to use.
 *
 * MVP scope: **one read action**, same "prove the mechanism, not full coverage" bar every other
 * vendor package in this ADR set (amoCRM's "Create lead", Диадок's "Get documents", 1С's
 * "Get records"). The response body's exact shape (the top-level key the operations list sits under)
 * isn't confirmed by any publicly-reachable sample response, so this deliberately returns the parsed
 * JSON verbatim (`Promise<unknown>`) rather than guessing a narrower type — same "don't guess,
 * flag it" discipline the ADR's 1С-CSRF and Диадок-status-model sections already apply.
 *
 * Going to production needs two more things this package doesn't touch: a real Bearer token as a
 * `credentialFields` secret (env-aware, same shape as `onecIntegration`'s resolver), and the mTLS
 * design pass the ADR's findings section calls for — neither started here.
 */
export const tbankIntegration: IWorkflowIntegration = {
  vendor: TBANK_VENDOR,
  label: 'Т-Банк (песочница)',
  notes:
    'T-Bank (Т-Банк, Tinkoff) business banking — bank account statement: fetch account operations/transactions (sandbox). Needs no credentials.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: TBANK_GET_STATEMENT_NAME,
      label: 'Т-Банк: Выписка по счёту (песочница)',
      // Multi-field editor (accountNumber/from/to/result), same reasoning as onec-get-records/http-request.
      editorType: 'sidebar',
      fields: [
        {
          name: 'accountNumber',
          label: 'Номер счёта (20 цифр — в песочнице реальные данные не нужны)',
          kind: 'text',
        },
        { name: 'from', label: 'Начало периода (ISO 8601, напр. 2026-01-01T00:00:00Z)', kind: 'text' },
        { name: 'to', label: 'Конец периода (необязательно, ISO 8601)', kind: 'text' },
        { name: 'resultVariable', label: 'Сохранить результат в', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await tbankGetStatement(${fields.accountNumber}, ${fields.from}, ${fields.to})`;
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature: 'tbankGetStatement(accountNumber: string, from: string, to: string): Promise<unknown>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const tbankGetStatement = async (',
        '  accountNumber: string,',
        '  from: string,',
        '  to: string,',
        '): Promise<unknown> => {',
        '  const params = new URLSearchParams({ accountNumber, from });',
        '  if (to) {',
        "    params.set('to', to);",
        '  }',
        '  const response = await fetch(',
        '    `https://business.tbank.ru/openapi/sandbox/api/v1/statement?${params.toString()}`,',
        '    {',
        // Literal, publicly-documented sandbox token — not a resolved credential, see the module
        // doc comment above.
        "      headers: { Authorization: 'Bearer TBankSandboxToken' },",
        '    },',
        '  );',
        '  if (!response.ok) {',
        '    throw new Error(`T-Bank sandbox statement request failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  return response.json();',
        '};',
      ].join('\n'),
    },
  ],
};

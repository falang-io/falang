const escapeLabel = (value) => value.replaceAll(/[\\']/g, (matched) => `\\${matched}`).replaceAll('\n', ' ');

/**
 * Renders the generated (never hand-edited) `.generated.ts` module for one vendor: the `method`
 * select's options, the operationId -> struct-id lookup a dynamic `expectedType` resolver uses (see
 * `IFieldConfig`'s own doc comment in `@falang/workflow-integrations-common`), every generated
 * `IIntegrationStructType`, and the routing table a hand-written `<vendor>.integration.ts` embeds
 * verbatim (via `JSON.stringify`) into its `sharedActivityCode` — same "inline object literal in the
 * compiled call site" pattern `openaiIntegration`'s `call-ai-choice` already uses for a JSON Schema.
 *
 * @param {{ constantPrefix: string, methods: readonly unknown[], structs: readonly unknown[] }} data
 */
export const renderIntegrationFile = ({ constantPrefix, methods, structs }) => {
  const methodOptionsLines = methods
    .toSorted((a, b) => a.summary.localeCompare(b.summary))
    .map((m) => `  { value: '${m.operationId}', label: '${escapeLabel(m.summary)}' },`)
    .join('\n');

  const methodStructIdLines = methods
    .map((m) => `  ${JSON.stringify(m.operationId)}: ${JSON.stringify(m.structId)},`)
    .join('\n');

  const structTypeLines = structs
    .map(
      (s) =>
        `  { id: ${JSON.stringify(s.id)}, name: ${JSON.stringify(s.name)}, properties: ${JSON.stringify(s.properties)} },`,
    )
    .join('\n');

  const routesEntries = Object.fromEntries(
    methods.map((m) => [
      m.operationId,
      {
        httpMethod: m.httpMethod,
        path: m.path,
        baseUrl: m.baseUrl,
        pathParams: m.pathParams,
        queryParams: m.queryParams,
        bodyMode: m.bodyMode,
      },
    ]),
  );

  return `// GENERATED FILE — do not hand-edit. Produced by scripts/openapi-integration-gen from the
// vendor's own OpenAPI spec. Re-run the generator to pick up spec changes instead of editing here.
import type { IFieldSelectOption, IIntegrationStructType } from '@falang/workflow-integrations-common';

export const ${constantPrefix}_METHOD_OPTIONS: readonly IFieldSelectOption[] = [
${methodOptionsLines}
];

/** operationId -> the \`IIntegrationStructType\` id capturing that method's flattened path/query/body params. */
export const ${constantPrefix}_METHOD_STRUCT_ID: Readonly<Record<string, string>> = {
${methodStructIdLines}
};

export const ${constantPrefix}_STRUCT_TYPES: readonly IIntegrationStructType[] = [
${structTypeLines}
];

export interface I${toPascal(constantPrefix)}Route {
  readonly httpMethod: string;
  readonly path: string;
  readonly baseUrl: string;
  readonly pathParams: readonly string[];
  readonly queryParams: readonly string[];
  readonly bodyMode: 'spread' | 'whole';
}

/** operationId -> how to actually build the HTTP call — embedded verbatim (JSON.stringify) into the runtime dispatcher's activityCode, see the hand-written \`${constantPrefix.toLowerCase()}.integration.ts\`. */
export const ${constantPrefix}_ROUTES: Readonly<Record<string, I${toPascal(constantPrefix)}Route>> = ${JSON.stringify(routesEntries)};
`;
};

const toPascal = (value) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

#!/usr/bin/env node
// Generates the `<vendor>.generated.ts` half of a "call vendor API" integration package from that
// vendor's own OpenAPI spec — see ADR 0017 (private)'s
// Wildberries/Ozon/МойСклад section. Usage:
//
//   node scripts/generate-openapi-integration.mjs <config.json>
//
// config.json:
//   {
//     "vendorPrefix": "ozon",           // lowercase id, prefixes every generated struct id
//     "constantPrefix": "OZON",         // upper-case prefix for exported constant names
//     "specs": ["/abs/path/spec.json"], // one or more already-bundled OpenAPI 3.x JSON or YAML files
//     "skipParamNames": ["Client-Id", "Api-Key"], // vendor-wide auth headers, not part of the params struct
//     "baseUrl": "https://api-seller.ozon.ru",    // optional override; else read from each doc's own `servers[0].url`
//     "outFile": "packages/workflow-integrations/ozon/src/ozon.generated.ts"
//   }
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import yaml from 'js-yaml';
import { buildVendorIntegration } from './openapi-integration-gen/build-vendor-integration.mjs';
import { renderIntegrationFile } from './openapi-integration-gen/render-integration-file.mjs';

const configPath = process.argv[2];
if (!configPath) {
  process.stderr.write('Usage: node scripts/generate-openapi-integration.mjs <config.json>\n');
  process.exit(1);
}

// Wildberries mirrors its spec as 13 per-category YAML files (no single bundled JSON is fetchable —
// see ADR 0017 (private)'s "Wildberries/Ozon/МойСклад: OpenAPI-generated packages"), so `.yaml`/`.yml`
// specs are parsed with `js-yaml` (already resolvable transitively, now a declared root devDependency)
// instead of assuming every vendor ships JSON the way Ozon/МойСклад do.
const parseSpec = (specPath) => {
  const raw = readFileSync(specPath, 'utf8');
  return ['.yaml', '.yml'].includes(extname(specPath)) ? yaml.load(raw) : JSON.parse(raw);
};

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const docs = config.specs.map(parseSpec);

const { methods, structs, stats } = buildVendorIntegration(docs, {
  vendorPrefix: config.vendorPrefix,
  skipParamNames: config.skipParamNames ?? [],
  baseUrl: config.baseUrl,
});

const output = renderIntegrationFile({ constantPrefix: config.constantPrefix, methods, structs });
writeFileSync(config.outFile, output);

process.stdout.write(
  `Wrote ${config.outFile}\n` +
    `  operations: ${stats.operations} (skipped, no operationId: ${stats.skippedNoOperationId})\n` +
    `  structs: ${stats.structs}\n` +
    `  enums degraded to string: ${stats.enumsDegraded}\n` +
    `  allOf merges: ${stats.allOfMerged}\n` +
    `  any fallbacks: ${stats.anyFallbacks}\n`,
);

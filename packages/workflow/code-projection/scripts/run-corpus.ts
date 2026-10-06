// oxlint-disable no-console, init-declarations, no-array-callback-reference -- CLI
/**
 * Runs the ADR 0061 round-trip/id measurements (G1/G2) over project export payloads on disk:
 * `npx tsx scripts/run-corpus.ts <file-or-dir>…` — every `*.json` with a `documents` array is a project
 * (the agent tuner's fixtures and `final-project.json` results, a `GET /projects/:id/export` download, …).
 * Prints numbers only; `--failures` also lists what failed.
 */
import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { REGISTERED_INTEGRATIONS } from '../../client-common/src/integrations-registry.js';
import { formatReport, runCorpus, type ICorpusProject } from '../src/corpus/round-trip-corpus.js';
import type { IWorkflowProjectDocument } from '../src/workflow-model.js';

const findJson = (path: string): string[] => {
  if (statSync(path).isFile()) return path.endsWith('.json') ? [path] : [];
  return readdirSync(path).flatMap((entry) => findJson(join(path, entry)));
};

const args = process.argv.slice(2);
const showFailures = args.includes('--failures');
const paths = args.filter((arg) => !arg.startsWith('--'));
const projects: ICorpusProject[] = [];
for (const file of paths.flatMap(findJson)) {
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  const documents = (payload as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) continue;
  const docs = documents as (IWorkflowProjectDocument & { data?: { instances?: IIntegrationInstance[] } })[];
  const instances = docs.find((doc) => doc.type === 'integrations')?.data?.instances ?? [];
  projects.push({ input: { documents: docs, instances, integrations: REGISTERED_INTEGRATIONS }, label: file });
}
const started = performance.now();
const report = runCorpus(projects);
console.log(formatReport(report));
console.log(`(${Math.round(performance.now() - started)} ms)`);
if (showFailures) {
  const byStage = new Map<string, number>();
  for (const failure of report.failures) byStage.set(failure.stage, (byStage.get(failure.stage) ?? 0) + 1);
  console.log('failures by stage', Object.fromEntries(byStage));
  for (const failure of report.failures.slice(0, 80))
    console.log(`- [${failure.stage}] ${failure.document}: ${failure.message}`);
}

// oxlint-disable max-lines -- one file for the whole workflow-only tool list (ADR 0029 (private)'s "Final v1 tool list"), each a thin wrapper with its own
// schema/annotations/handler — splitting further would scatter one cohesive concern across files
// with no natural seam, same reasoning `mcp-shared-tools.ts` gives for its own cap-exceeding size.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zod } from '@falang/dto';
import type { IDebugLocation } from '@falang/debug';
import {
  describeFieldForAgent,
  INTEGRATIONS_DOCUMENT_TYPE,
  loadIntegrationLabelResolver,
  searchIntegrationCatalog,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { ActivepiecesCatalogService } from '../integrations/activepieces-catalog.service.js';
import { REGISTERED_INTEGRATIONS } from '../integrations/registered-integrations.js';
import type { BuildService } from '../build/build/build.service.js';
import type { DebugService } from '../build/debug/debug.service.js';
import type { DocumentsService } from '../projects/documents/documents.service.js';
import type { ProjectExportService } from '../projects/export/project-export.service.js';
import type { ProjectsService } from '../projects/projects/projects.service.js';
import type { RunsService } from '../runs/runs.service.js';
import { assertMcpProjectScope, type IMcpAuthContext } from './mcp-auth.js';
import { registerLooseTool } from './mcp-register-tool.js';
import { errorResult, okResult, withToolErrors } from './mcp-tool-result.js';

export interface IWorkflowToolsDeps {
  readonly projectsService: ProjectsService;
  readonly documentsService: DocumentsService;
  readonly projectExportService: ProjectExportService;
  readonly buildService: BuildService;
  readonly debugService: DebugService;
  readonly runsService: RunsService;
  readonly activepiecesCatalog: ActivepiecesCatalogService;
}

const debugLocation = zod.object({ documentId: zod.string(), nodeId: zod.string() });

const readOnly = { readOnlyHint: true } as const;
const destructive = { destructiveHint: true } as const;

const combinedIntegrations = async (deps: IWorkflowToolsDeps): Promise<readonly IWorkflowIntegration[]> => [
  ...REGISTERED_INTEGRATIONS,
  ...(await deps.activepiecesCatalog.getDynamicIntegrations()),
];

/** One vendor as `list_integrations` describes a keyword match: unlike the in-app agent's
 *  `search_integrations`, an MCP client composes whole documents with `set_document`, so each action's
 *  fields are spelled out here too. No vendor/trigger `label` — `notes` is required precisely so this
 *  catalog never needs it (ADR 0034 (private)'s "third real chat" note). Action/field/question/choice
 *  `label`s stay, resolved to English text through the vendor's own `locales`
 *  (`loadIntegrationLabelResolver`) — some vendors' labels are i18n keys (`openai:action.callAiText`),
 *  meaningless outside the UI's `I18NStore`. */
const describeIntegrationForMcp = async (integration: IWorkflowIntegration) => {
  const t = await loadIntegrationLabelResolver(integration);
  return {
    vendor: integration.vendor,
    notes: integration.notes,
    actions: integration.actions.map((action) => ({
      nodeKind: action.name,
      label: t(action.label),
      fields: action.fields.map((field) => ({
        name: field.name,
        label: t(field.label),
        kind: field.kind,
        description: describeFieldForAgent(field),
      })),
    })),
    triggers: integration.triggers.map((trigger) => ({
      nodeKind: trigger.name,
      notes: trigger.notes,
      contextFields: trigger.contextFields?.map((field) => ({ name: field.name, kind: field.kind })),
    })),
    questions: (integration.questions ?? []).map((question) => ({
      nodeKind: question.name,
      label: t(question.label),
    })),
    choices: (integration.choices ?? []).map((choice) => ({ nodeKind: choice.name, label: t(choice.label) })),
  };
};

/**
 * The workflow-only tools from ADR 0029 (private)'s "Final v1 tool list" —
 * each a thin wrapper over an existing service, mirroring its REST controller's own request/response
 * shape (see `build.controller.ts`/`debug.controller.ts`/`runs.controller.ts`). A project-scoped PAT
 * (`auth.projectScope` set) can never `list_projects` beyond its own scope, and can never
 * `create_project`/`import_project` at all — both would mint a project outside what the token was
 * scoped to, the same reasoning `assertMcpProjectScope` applies everywhere else.
 */
export const registerWorkflowMcpTools = (
  server: McpServer,
  deps: IWorkflowToolsDeps,
  getAuth: () => IMcpAuthContext,
): void => {
  registerLooseTool(
    server,
    'list_projects',
    {
      description: 'Read-only. Lists every project this token can see.',
      inputSchema: zod.object({}),
      annotations: readOnly,
    },
    withToolErrors(async () => {
      const auth = getAuth();
      const projects = await deps.projectsService.list(auth.user.id);
      const scoped = auth.projectScope ? projects.filter((project) => project.id === auth.projectScope) : projects;
      return okResult(scoped.map((project) => ({ id: project.id, name: project.name })));
    }),
  );

  registerLooseTool(
    server,
    'create_project',
    {
      description: 'Creates a new, empty project (not available to a project-scoped token).',
      inputSchema: zod.object({ name: zod.string() }),
    },
    withToolErrors(async ({ name }: { name: string }) => {
      const auth = getAuth();
      if (auth.projectScope) return errorResult('This token is scoped to one project and cannot create a new one.');
      const project = await deps.projectsService.create(auth.user.id, name);
      return okResult({ id: project.id, name: project.name });
    }),
  );

  registerLooseTool(
    server,
    'import_project',
    {
      description:
        'Imports a whole project from the project export/import JSON fixture format (the same one the export endpoint produces) (not available to a project-scoped token) — the cheapest way to author a whole project in one call.',
      inputSchema: zod.object({ payload: zod.unknown() }),
    },
    withToolErrors(async ({ payload }: { payload: unknown }) => {
      const auth = getAuth();
      if (auth.projectScope) return errorResult('This token is scoped to one project and cannot import a new one.');
      const project = await deps.projectExportService.importProject(
        auth.user.id,
        payload as Parameters<ProjectExportService['importProject']>[1],
      );
      return okResult({ id: project.id, name: project.name });
    }),
  );

  registerLooseTool(
    server,
    'export_project',
    {
      description:
        'Read-only. Exports the whole project in the project export/import JSON fixture format (credential secrets stripped).',
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.projectExportService.exportProject(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'list_functions',
    {
      description: "Read-only. Lists every function document's name, parameters, and return type.",
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.listFunctions(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'build',
    {
      description: "Compiles the project's current documents and (re)starts the dev runner.",
      inputSchema: zod.object({ projectId: zod.string() }),
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.build(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'get_build_status',
    {
      description: 'Read-only. Whether the dev runner is live.',
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.getDevStatus(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'get_code',
    {
      description:
        'Read-only. Compiles the project for preview only — one entry per generated module, no runner started.',
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.generateCode(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'start_dev_run',
    {
      description:
        'Starts one execution of a function document on the dev runner (requires a prior build) and returns its ids right away — follow it with get_run_position.',
      inputSchema: zod.object({
        projectId: zod.string(),
        functionName: zod.string(),
        args: zod.array(zod.unknown()).default([]),
      }),
    },
    withToolErrors(
      async ({
        projectId,
        functionName,
        args,
      }: {
        projectId: string;
        functionName: string;
        args: readonly unknown[];
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        return okResult(await deps.buildService.startDevRun(projectId, auth.user.id, { functionName, args }));
      },
    ),
  );

  registerLooseTool(
    server,
    'get_run_position',
    {
      description: 'Read-only. Polled while a run is watched — where the execution currently is in its diagram.',
      inputSchema: zod.object({ projectId: zod.string(), workflowId: zod.string(), runId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(
      async ({ projectId, workflowId, runId }: { projectId: string; workflowId: string; runId: string }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        return okResult(await deps.buildService.getRunPosition(projectId, auth.user.id, workflowId, runId));
      },
    ),
  );

  registerLooseTool(
    server,
    'stop',
    { description: 'Stops the dev runner.', inputSchema: zod.object({ projectId: zod.string() }) },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await deps.buildService.stop(projectId, auth.user.id);
      return okResult({ stopped: true });
    }),
  );

  registerLooseTool(
    server,
    'list_runs',
    {
      description: 'Read-only. Lists dev/prod workflow executions, optionally filtered.',
      inputSchema: zod.object({
        projectId: zod.string().optional(),
        workflowName: zod.string().optional(),
        version: zod.string().optional(),
        buildId: zod.string().optional(),
      }),
      annotations: readOnly,
    },
    withToolErrors(
      async ({
        projectId,
        workflowName,
        version,
        buildId,
      }: {
        projectId?: string;
        workflowName?: string;
        version?: string;
        buildId?: string;
      }) => {
        const auth = getAuth();
        const effectiveProjectId = auth.projectScope ?? projectId;
        if (projectId) assertMcpProjectScope(auth, projectId);
        return okResult(
          await deps.runsService.listRuns(auth.user.id, {
            projectId: effectiveProjectId,
            workflowName,
            version,
            buildId,
          }),
        );
      },
    ),
  );

  registerLooseTool(
    server,
    'get_run_history',
    {
      description:
        'Read-only. Full detail (including the event timeline) of one workflow run — never trusts a client-supplied projectId, ownership is derived from the run itself.',
      inputSchema: zod.object({ workflowId: zod.string(), runId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ workflowId, runId }: { workflowId: string; runId: string }) => {
      const auth = getAuth();
      const detail = await deps.runsService.getRunDetail(auth.user.id, workflowId, runId);
      assertMcpProjectScope(auth, detail.projectId);
      return okResult(detail);
    }),
  );

  registerLooseTool(
    server,
    'publish',
    {
      description: "Compiles the project's current documents into a new, immutable published version.",
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: destructive,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.publish(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'list_versions',
    {
      description: 'Read-only. Lists every published version.',
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.buildService.listVersions(projectId, auth.user.id));
    }),
  );

  registerLooseTool(
    server,
    'activate_version',
    {
      description: 'Rolls back to (or re-activates) an already-published version.',
      inputSchema: zod.object({ projectId: zod.string(), versionNumber: zod.number().int() }),
      annotations: destructive,
    },
    withToolErrors(async ({ projectId, versionNumber }: { projectId: string; versionNumber: number }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await deps.buildService.activate(projectId, auth.user.id, versionNumber);
      return okResult({ activated: versionNumber });
    }),
  );

  registerLooseTool(
    server,
    'stop_version',
    {
      description: "Explicitly retires a published version's runner.",
      inputSchema: zod.object({ projectId: zod.string(), versionNumber: zod.number().int() }),
      annotations: destructive,
    },
    withToolErrors(async ({ projectId, versionNumber }: { projectId: string; versionNumber: number }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await deps.buildService.stopVersion(projectId, auth.user.id, versionNumber);
      return okResult({ stopped: versionNumber });
    }),
  );

  registerLooseTool(
    server,
    'debug_start',
    {
      description:
        'Starts a workflow debugger session (dev build only) — resolves breakpoints, wakes the dev runner, and arms them before the first statement runs.',
      inputSchema: zod.object({
        projectId: zod.string(),
        functionName: zod.string(),
        args: zod.array(zod.unknown()).default([]),
        breakpoints: zod.array(debugLocation).default([]),
        pauseOnEntry: zod.boolean().default(false),
      }),
    },
    withToolErrors(
      async ({
        projectId,
        functionName,
        args,
        breakpoints,
        pauseOnEntry,
      }: {
        projectId: string;
        functionName: string;
        args: readonly unknown[];
        breakpoints: readonly IDebugLocation[];
        pauseOnEntry: boolean;
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        return okResult(
          await deps.debugService.start(projectId, auth.user.id, { functionName, args, breakpoints, pauseOnEntry }),
        );
      },
    ),
  );

  registerLooseTool(
    server,
    'debug_state',
    {
      description: 'Read-only. Polled while a debug session is running/paused.',
      inputSchema: zod.object({ projectId: zod.string(), workflowId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId, workflowId }: { projectId: string; workflowId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      return okResult(await deps.debugService.getState(projectId, auth.user.id, workflowId));
    }),
  );

  registerLooseTool(
    server,
    'debug_set_breakpoints',
    {
      description: 'Full replacement of the live breakpoint set on a running debug session.',
      inputSchema: zod.object({
        projectId: zod.string(),
        workflowId: zod.string(),
        breakpoints: zod.array(debugLocation),
      }),
    },
    withToolErrors(
      async ({
        projectId,
        workflowId,
        breakpoints,
      }: {
        projectId: string;
        workflowId: string;
        breakpoints: readonly IDebugLocation[];
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        await deps.debugService.setBreakpoints(projectId, auth.user.id, workflowId, breakpoints);
        return okResult({ breakpoints });
      },
    ),
  );

  registerLooseTool(
    server,
    'debug_resume',
    {
      description: 'Resumes a paused debug session — mode "continue" or "step-over".',
      inputSchema: zod.object({
        projectId: zod.string(),
        workflowId: zod.string(),
        mode: zod.enum(['continue', 'step-over']),
      }),
    },
    withToolErrors(
      async ({
        projectId,
        workflowId,
        mode,
      }: {
        projectId: string;
        workflowId: string;
        mode: 'continue' | 'step-over';
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        await deps.debugService.resume(projectId, auth.user.id, workflowId, mode);
        return okResult({ resumed: mode });
      },
    ),
  );

  registerLooseTool(
    server,
    'debug_stop',
    {
      description: 'Terminates a debug session.',
      inputSchema: zod.object({ projectId: zod.string(), workflowId: zod.string() }),
    },
    withToolErrors(async ({ projectId, workflowId }: { projectId: string; workflowId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await deps.debugService.stop(projectId, auth.user.id, workflowId);
      return okResult({ stopped: true });
    }),
  );

  registerLooseTool(
    server,
    'list_credentials',
    {
      description: 'Read-only. id/name/vendor only for every configured credential — never secrets.',
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: readOnly,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      const documents = await deps.documentsService.listFull(projectId, auth.user.id);
      const integrationsDocument = documents.find((document) => document.type === INTEGRATIONS_DOCUMENT_TYPE);
      const data = integrationsDocument?.data as IIntegrationsDocumentData | undefined;
      const instances = data?.instances ?? [];
      return okResult(instances.map((instance) => ({ id: instance.id, name: instance.name, vendor: instance.vendor })));
    }),
  );

  registerLooseTool(
    server,
    'list_integrations',
    {
      description:
        'Read-only. Keyword search over the integration vendor catalog. Pass `keywords` (e.g. ["telegram"], ' +
        '["ai", "llm"], ["crm"]) to get the best-matching vendors (up to 10, most keywords matched first — ' +
        'matched against vendor id, its plain-English notes, node kind names and trigger names/notes), each ' +
        'with its notes, action node kinds and fields, triggers and question/choice node kinds; omit ' +
        '`keywords` for a compact index of every vendor (id + notes only). Each vendor action is its own node ' +
        'kind — except ActivePieces pieces, which all share the single generic "activepieces-action" node ' +
        "kind (pieceName/actionName/credentialId/propsValue). Every trigger's notes is a required " +
        'plain-English description — read it before picking a trigger: it flags non-obvious semantics, e.g. ' +
        "which of a vendor's several triggers to prefer for a given case instead of reimplementing that " +
        'filtering logic inside the function body.',
      inputSchema: zod.object({
        keywords: zod
          .array(zod.string())
          .optional()
          .describe('English search words (vendor notes are English); omit for the compact index.'),
      }),
      annotations: readOnly,
    },
    withToolErrors(async ({ keywords }: { keywords?: string[] }) => {
      const integrations = await combinedIntegrations(deps);
      const result = searchIntegrationCatalog(integrations, keywords, describeIntegrationForMcp);
      return okResult({ ...result, vendors: await Promise.all(result.vendors) });
    }),
  );
};

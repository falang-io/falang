import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DocumentStackRegistry } from '@falang/mcp-core';
import type { Application, Request, Response } from 'express';
import { ActivepiecesCatalogService } from '../integrations/activepieces-catalog.service.js';
import { REGISTERED_INTEGRATIONS } from '../integrations/registered-integrations.js';
import { BuildService } from '../build/build/build.service.js';
import { DebugService } from '../build/debug/debug.service.js';
import { DocumentsService } from '../projects/documents/documents.service.js';
import { FoldersService } from '../projects/folders/folders.service.js';
import { ProjectExportService } from '../projects/export/project-export.service.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { RunsService } from '../runs/runs.service.js';
import { PersonalAccessTokensService } from '../auth/personal-access-tokens/personal-access-tokens.service.js';
import { resolveMcpAuth, type IMcpAuthContext } from './mcp-auth.js';
import { registerSharedMcpTools } from './mcp-shared-tools.js';
import { registerWorkflowMcpTools } from './mcp-workflow-tools.js';
import { buildWorkflowMcpRegistry } from './workflow-mcp-registry.js';

const SERVER_INFO = { name: 'falang-workflow', version: '1.0.0' };

const JSON_RPC_METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0' as const,
  error: { code: -32_000, message: 'Method not allowed.' },
  id: null,
};
const JSON_RPC_UNAUTHORIZED = {
  jsonrpc: '2.0' as const,
  error: { code: -32_001, message: 'Unauthorized — a valid "Authorization: Bearer flg_pat_…" header is required.' },
  id: null,
};

/**
 * Mounts `/mcp` (POST/GET/DELETE) directly on the underlying Express instance — no Nest controller,
 * per ADR 0029 (private)'s "Where it lives" ("the SDK owns the request/
 * response lifecycle for its own protocol"). Called from `main.ts` via `app.get(McpService).mount(...)`
 * after Nest's own body parser is registered (see that file).
 *
 * **Session model: stateless, one `McpServer` + `StreamableHTTPServerTransport` pair per POST
 * request** (`sessionIdGenerator: undefined`), following the SDK's own documented "stateless server"
 * pattern (`examples/server/simpleStatelessStreamableHttp.ts`) rather than a `Mcp-Session-Id`-keyed
 * map. Chosen over stateful sessions because every tool here is a one-shot call into a service that is
 * itself already the source of truth (no useful server-side state to hold between calls — `set_document`'s
 * lock lives in the `documents` table, not in a session), and because it sidesteps session
 * expiry/cleanup entirely; the SDK still allows a client to send an `Mcp-Session-Id` GET/DELETE, but
 * since this server never issues one, both routes simply answer 405 (matching the example verbatim).
 * PAT auth runs once per request, before the transport is even constructed — a request that fails it
 * never reaches SDK protocol handling at all, so an invalid token never gets a JSON-RPC-shaped error
 * for a request it never parsed.
 */
@Injectable()
export class McpService {
  private readonly projectsService: ProjectsService;
  private readonly documentsService: DocumentsService;
  private readonly foldersService: FoldersService;
  private readonly projectExportService: ProjectExportService;
  private readonly buildService: BuildService;
  private readonly debugService: DebugService;
  private readonly runsService: RunsService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly oauthCredentials: OAuthCredentialsService;
  private readonly tokensService: PersonalAccessTokensService;
  private readonly registry: DocumentStackRegistry;

  constructor(
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(DocumentsService) documentsService: DocumentsService,
    @Inject(FoldersService) foldersService: FoldersService,
    @Inject(ProjectExportService) projectExportService: ProjectExportService,
    @Inject(BuildService) buildService: BuildService,
    @Inject(DebugService) debugService: DebugService,
    @Inject(RunsService) runsService: RunsService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(PersonalAccessTokensService) tokensService: PersonalAccessTokensService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
  ) {
    this.projectsService = projectsService;
    this.documentsService = documentsService;
    this.foldersService = foldersService;
    this.projectExportService = projectExportService;
    this.buildService = buildService;
    this.debugService = debugService;
    this.runsService = runsService;
    this.activepiecesCatalog = activepiecesCatalog;
    this.oauthCredentials = oauthCredentials;
    this.tokensService = tokensService;
    // Built once, from the *static* vendor list only — see `workflow-mcp-registry.ts`'s own doc
    // comment for why dynamic ActivePieces pieces don't need a place in this registry.
    this.registry = buildWorkflowMcpRegistry(REGISTERED_INTEGRATIONS);
  }

  mount(app: Application): void {
    app.post('/mcp', (req: Request, res: Response) => {
      this.handlePost(req, res).catch((error: unknown) => {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32_603, message: error instanceof Error ? error.message : String(error) },
            id: null,
          });
        }
      });
    });
    app.get('/mcp', (_req: Request, res: Response) => {
      res.status(405).json(JSON_RPC_METHOD_NOT_ALLOWED);
    });
    app.delete('/mcp', (_req: Request, res: Response) => {
      res.status(405).json(JSON_RPC_METHOD_NOT_ALLOWED);
    });
  }

  private async handlePost(req: Request, res: Response): Promise<void> {
    const auth = await resolveMcpAuth(req.headers.authorization, this.tokensService);
    if (!auth) {
      res.status(401).json(JSON_RPC_UNAUTHORIZED);
      return;
    }

    const server = this.buildServer(auth);
    // Stateless mode: an explicit `undefined` opts out of the SDK's own `Mcp-Session-Id` issuance —
    // see this class's own doc comment for the session-model rationale.
    // oxlint-disable-next-line no-undefined
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      // Best-effort teardown once the response has already closed — nothing meaningful to do with
      // a close/close failure at that point.
      // oxlint-disable-next-line no-empty-function
      transport.close().catch(() => {});
      // oxlint-disable-next-line no-empty-function
      server.close().catch(() => {});
    });
  }

  private buildServer(auth: IMcpAuthContext): McpServer {
    const server = new McpServer(SERVER_INFO);
    const getAuth = (): IMcpAuthContext => auth;
    registerSharedMcpTools(
      server,
      { documentsService: this.documentsService, foldersService: this.foldersService, registry: this.registry },
      getAuth,
    );
    registerWorkflowMcpTools(
      server,
      {
        projectsService: this.projectsService,
        documentsService: this.documentsService,
        projectExportService: this.projectExportService,
        buildService: this.buildService,
        debugService: this.debugService,
        runsService: this.runsService,
        activepiecesCatalog: this.activepiecesCatalog,
        oauthCredentials: this.oauthCredentials,
      },
      getAuth,
    );
    return server;
  }
}

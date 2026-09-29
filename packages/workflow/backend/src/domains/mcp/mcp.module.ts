import { Module } from '@nestjs/common';
import { PersonalAccessTokensModule } from '../auth/personal-access-tokens/personal-access-tokens.module.js';
import { BuildModule } from '../build/build/build.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { DocumentsModule } from '../projects/documents/documents.module.js';
import { ProjectExportModule } from '../projects/export/project-export.module.js';
import { FoldersModule } from '../projects/folders/folders.module.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { RunsModule } from '../runs/runs.module.js';
import { McpService } from './mcp.service.js';

/**
 * No controller, no routes registered through Nest's own router — `McpService.mount()` wires `/mcp`
 * directly onto the underlying Express instance from `main.ts`, see that service's own doc comment.
 * This module exists purely to assemble `McpService`'s dependencies through Nest DI (every domain
 * service `/mcp`'s tools wrap) and to export it so `main.ts` can `app.get(McpService)`.
 */
@Module({
  imports: [
    PersonalAccessTokensModule,
    ProjectsModule,
    FoldersModule,
    DocumentsModule,
    ProjectExportModule,
    BuildModule,
    RunsModule,
    IntegrationsModule,
  ],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}

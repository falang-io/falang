import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { AgentSettingsService } from './agent-settings.service.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpsertAgentSettingsDto } from './dto/upsert-agent-settings.dto.js';

export interface IAdminAgentSettings {
  readonly configured: boolean;
  readonly baseUrl: string | null;
  readonly model: string | null;
  readonly hasApiKey: boolean;
  readonly updatedAt: string | null;
}

/**
 * `/admin/settings/agent` — the app-wide AI agent config (base URL / model / API key) that
 * `POST /projects/:id/agent/chat` resolves at call time, replacing the per-project "openai"
 * integration credential the chat panel used to require. Never returns the API key itself. See
 * ADR 0031 (private).
 */
@UseGuards(AdminGuard)
@Controller('admin/settings/agent')
export class AdminAgentSettingsController {
  private readonly agentSettings: AgentSettingsService;

  constructor(@Inject(AgentSettingsService) agentSettings: AgentSettingsService) {
    this.agentSettings = agentSettings;
  }

  @Get()
  get(): Promise<IAdminAgentSettings> {
    return this.agentSettings.getStatus();
  }

  @Put()
  put(@Body() body: UpsertAgentSettingsDto): Promise<IAdminAgentSettings> {
    return this.agentSettings.upsert(body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(): Promise<void> {
    await this.agentSettings.remove();
  }
}

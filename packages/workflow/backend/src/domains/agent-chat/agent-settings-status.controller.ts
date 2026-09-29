import { Controller, Get, Inject } from '@nestjs/common';
import { AgentSettingsService } from '../admin/app-settings/agent-settings.service.js';

export interface IAgentSettingsStatusResponse {
  readonly configured: boolean;
  readonly model: string | null;
}

/**
 * `GET /agent/settings` — any signed-in user (the global JWT guard already applies, no extra
 * guard needed), so the chat panel can show a "not configured, ask an administrator" notice
 * instead of the send button. See ADR 0031 (private).
 */
@Controller('agent/settings')
export class AgentSettingsStatusController {
  private readonly agentSettings: AgentSettingsService;

  constructor(@Inject(AgentSettingsService) agentSettings: AgentSettingsService) {
    this.agentSettings = agentSettings;
  }

  @Get()
  async get(): Promise<IAgentSettingsStatusResponse> {
    const status = await this.agentSettings.getStatus();
    return { configured: status.configured, model: status.model };
  }
}

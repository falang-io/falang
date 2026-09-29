import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { AgentChatService } from './agent-chat.service.js';
import type { IAgentChatResult } from './agent-chat.types.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO class
// to validate against from this parameter's runtime type metadata, so erasing the import would
// silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { AgentChatRequestDto } from './dto/agent-chat-request.dto.js';

/**
 * Called by the logged-in editor to drive `@falang/agent`'s tool-calling loop — the loop itself runs
 * client-side (it mutates the open `Scheme` through its own actions), this route is a stateless proxy
 * to an OpenAI-compatible `/chat/completions` endpoint: the client sends the abstract `system` /
 * `messages` / `tools` `@falang/agent` already built, this translates them to OpenAI's wire format and
 * back, so `@falang/agent`'s `ILlmClient` stays vendor-agnostic (see ADR 0009 (private)).
 * Resolves the app-wide agent config (`AgentSettingsService`) rather than a per-project credential —
 * see ADR 0031 (private).
 */
@Controller('projects/:projectId/agent/chat')
export class AgentChatController {
  private readonly agentChatService: AgentChatService;

  constructor(@Inject(AgentChatService) agentChatService: AgentChatService) {
    this.agentChatService = agentChatService;
  }

  @Post()
  chat(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: AgentChatRequestDto,
  ): Promise<IAgentChatResult> {
    return this.agentChatService.chat(projectId, user.id, body);
  }
}

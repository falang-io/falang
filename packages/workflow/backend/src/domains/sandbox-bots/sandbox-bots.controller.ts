// oxlint-disable no-await-in-loop -- one settings read per sandbox vendor (a handful).
import {
  Controller,
  ConflictException,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PreconditionFailedException,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { SandboxBotSettingsService } from './sandbox-bot-settings.service.js';
import { SandboxBotsService } from './sandbox-bots.service.js';

export interface ISandboxPlatformPublic {
  readonly vendor: string;
  readonly username: string;
  readonly title: string;
}

export interface ISandboxBindingResponse {
  readonly id: string;
  readonly chatTitle: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly expiresAt: string;
}

/** The signed-in user's side of the sandbox bots: configured platforms, connect links, connected chats (ADR 0073 (private)). */
@Controller()
export class SandboxBotsController {
  private readonly bots: SandboxBotsService;
  private readonly bindings: SandboxBindingsService;
  private readonly settings: SandboxBotSettingsService;
  private readonly projects: ProjectsService;

  constructor(
    @Inject(SandboxBotsService) bots: SandboxBotsService,
    @Inject(SandboxBindingsService) bindings: SandboxBindingsService,
    @Inject(SandboxBotSettingsService) settings: SandboxBotSettingsService,
    @Inject(ProjectsService) projects: ProjectsService,
  ) {
    this.bots = bots;
    this.bindings = bindings;
    this.settings = settings;
    this.projects = projects;
  }

  @Get('sandbox-bots')
  async list(): Promise<{ platforms: ISandboxPlatformPublic[] }> {
    const platforms: ISandboxPlatformPublic[] = [];
    for (const integration of this.bots.listSandboxIntegrations()) {
      const row = await this.settings.row(integration.vendor);
      if (row.configured) {
        platforms.push({ vendor: integration.vendor, username: row.username ?? '', title: row.title ?? '' });
      }
    }
    return { platforms };
  }

  @Post('projects/:id/integrations/:credentialId/sandbox-link')
  @HttpCode(HttpStatus.CREATED)
  async createLink(
    @Param('id') projectId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<{ url: string; expiresAt: string }> {
    await this.projects.getOwnedProject(projectId, user.id, 'edit');
    const instance = await this.bindings.findInstance(projectId, credentialId);
    if (!instance) throw new NotFoundException(`Credential "${credentialId}" not found`);
    const adapter = this.bots.getAdapter(instance.vendor);
    if (!adapter || instance.devSandbox !== true) {
      throw new ConflictException({ code: 'sandbox_off', message: 'Sandbox mode is not enabled for this credential' });
    }
    const stored = await this.settings.row(instance.vendor);
    if (!stored.configured) {
      throw new PreconditionFailedException({
        code: 'sandbox_not_configured',
        message: 'No test bot is configured for this messenger',
      });
    }
    const { code, expiresAt } = await this.bindings.createLinkCode({
      vendor: instance.vendor,
      projectId,
      credentialId,
      createdBy: user.id,
    });
    const url = adapter.buildChatLink({ username: stored.username ?? '', title: stored.title ?? '' }, `fl_${code}`);
    return { url, expiresAt: expiresAt.toISOString() };
  }

  @Get('projects/:id/integrations/:credentialId/sandbox-bindings')
  async listBindings(
    @Param('id') projectId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ISandboxBindingResponse[]> {
    await this.projects.getOwnedProject(projectId, user.id, 'read');
    const live = await this.bindings.listLive(projectId, credentialId);
    return live.map(({ binding, expiresAt }) => ({
      id: binding.id,
      chatTitle: binding.chatTitle,
      createdAt: binding.createdAt.toISOString(),
      lastActivityAt: binding.lastActivityAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }));
  }

  @Delete('projects/:id/integrations/:credentialId/sandbox-bindings/:bindingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBinding(
    @Param('id') projectId: string,
    @Param('credentialId') credentialId: string,
    @Param('bindingId') bindingId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.projects.getOwnedProject(projectId, user.id, 'edit');
    const binding = await this.bindings.findById(projectId, credentialId, bindingId);
    if (!binding) throw new NotFoundException('Binding not found');
    await this.bindings.remove(binding);
    await this.bots.sendServiceText(binding.vendor, binding.chatId, this.bots.serviceTexts().disconnectedFromEditor());
    await this.bots.refreshChatCommands(binding.vendor, binding.chatId, null);
  }
}

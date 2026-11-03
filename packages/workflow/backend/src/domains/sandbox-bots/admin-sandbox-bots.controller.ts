// oxlint-disable init-declarations, no-undefined -- optional adapter results.
import { runWithEgressVendor } from '@falang/workflow-egress';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/auth/admin.guard.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { SetSandboxBindingTtlDto, UpsertSandboxBotDto } from './dto/sandbox-bots-dto.js';
import {
  SandboxBotSettingsService,
  COMMAND_NAME_PATTERN,
  type ISandboxPlatformRow,
} from './sandbox-bot-settings.service.js';
import {
  SANDBOX_MESSAGES_PER_HOUR,
  SANDBOX_UNREACHABLE_PER_HOUR,
  SandboxAbuseService,
  type ISandboxBlockRow,
} from './sandbox-abuse.service.js';
import { SandboxBotsService } from './sandbox-bots.service.js';

export interface ISandboxSettingsResponse {
  readonly bindingTtlMinutes: number;
  readonly platforms: ISandboxPlatformRow[];
  /** The fixed abuse limits, per account and messenger, for the page's explanation. */
  readonly limits: { readonly messagesPerHour: number; readonly unreachablePerHour: number };
}

/** `/admin/settings/sandbox-bots` — the platform's test bots (ADR 0073 (private)). The token is never returned. */
@UseGuards(AdminGuard)
@Controller('admin/settings/sandbox-bots')
export class AdminSandboxBotsController {
  private readonly settings: SandboxBotSettingsService;
  private readonly bots: SandboxBotsService;
  private readonly abuse: SandboxAbuseService;

  constructor(
    @Inject(SandboxBotSettingsService) settings: SandboxBotSettingsService,
    @Inject(SandboxBotsService) bots: SandboxBotsService,
    @Inject(SandboxAbuseService) abuse: SandboxAbuseService,
  ) {
    this.settings = settings;
    this.bots = bots;
    this.abuse = abuse;
  }

  private requireAdapter(vendor: string) {
    const adapter = this.bots.getAdapter(vendor);
    if (!adapter) throw new NotFoundException(`No sandbox bot support for vendor "${vendor}"`);
    return adapter;
  }

  private async snapshot(): Promise<ISandboxSettingsResponse> {
    const platforms = await Promise.all(
      this.bots.listSandboxIntegrations().map((integration) => this.settings.row(integration.vendor)),
    );
    return {
      bindingTtlMinutes: await this.settings.getBindingTtlMinutes(),
      platforms,
      limits: { messagesPerHour: SANDBOX_MESSAGES_PER_HOUR, unreachablePerHour: SANDBOX_UNREACHABLE_PER_HOUR },
    };
  }

  @Get()
  get(): Promise<ISandboxSettingsResponse> {
    return this.snapshot();
  }

  /** Accounts the test bot is blocked for (abuse protection), newest first. */
  @Get('blocks')
  listBlocks(): Promise<ISandboxBlockRow[]> {
    return this.abuse.listBlocks();
  }

  @Delete('blocks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    if (!(await this.abuse.unblock(id))) throw new NotFoundException('Block not found');
  }

  @Put()
  async putGlobal(@Body() body: SetSandboxBindingTtlDto): Promise<ISandboxSettingsResponse> {
    await this.settings.setBindingTtlMinutes(body.bindingTtlMinutes);
    return this.snapshot();
  }

  @Put(':vendor')
  async putVendor(@Param('vendor') vendor: string, @Body() body: UpsertSandboxBotDto): Promise<ISandboxPlatformRow> {
    const adapter = this.requireAdapter(vendor);
    if (body.commandName !== undefined && !COMMAND_NAME_PATTERN.test(body.commandName)) {
      throw new BadRequestException('commandName must match ^[a-z0-9_]{1,32}$');
    }
    const token = body.token?.trim() ?? '';
    if (token === '' && !(await this.settings.hasToken(vendor))) {
      throw new BadRequestException({ code: 'token_required', message: 'A token is required the first time' });
    }
    if (token !== '') {
      let info;
      try {
        info = await runWithEgressVendor(vendor, () => adapter.getBotInfo(token));
      } catch (error) {
        throw new BadRequestException({
          code: 'invalid_token',
          message: error instanceof Error ? error.message : 'The token was rejected',
        });
      }
      await this.settings.saveToken(vendor, token, info);
    }
    if (body.commandName !== undefined) await this.settings.saveCommandName(vendor, body.commandName);
    await this.bots.requestReconcile();
    return this.settings.row(vendor);
  }

  @Delete(':vendor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVendor(@Param('vendor') vendor: string): Promise<void> {
    this.requireAdapter(vendor);
    await this.settings.remove(vendor);
    await this.bots.requestReconcile();
  }

  @Post(':vendor/check')
  @HttpCode(HttpStatus.OK)
  async check(
    @Param('vendor') vendor: string,
  ): Promise<{ ok: true; username: string; title: string } | { ok: false; error: string }> {
    const adapter = this.requireAdapter(vendor);
    const stored = await this.settings.load(vendor);
    if (!stored) return { ok: false, error: 'No token is configured' };
    try {
      const info = await runWithEgressVendor(vendor, () => adapter.getBotInfo(stored.token));
      return { ok: true, username: info.username, title: info.title };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The token was rejected' };
    }
  }
}

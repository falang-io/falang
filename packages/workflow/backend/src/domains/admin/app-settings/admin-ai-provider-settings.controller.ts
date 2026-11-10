import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import {
  AiProviderSettingsService,
  type IAiProviderSettingsStatus,
  type IUpstreamModel,
} from './ai-provider-settings.service.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { FetchAiProviderModelsDto } from './dto/fetch-ai-provider-models.dto.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpsertAiProviderSettingsDto } from './dto/upsert-ai-provider-settings.dto.js';

/**
 * `/admin/settings/ai-provider` — the built-in AI provider for workflow OpenAI nodes (ADR 0081 (private)): endpoint,
 * key and the models users may pick. Never returns the key.
 */
@UseGuards(AdminGuard)
@Controller('admin/settings/ai-provider')
export class AdminAiProviderSettingsController {
  private readonly settings: AiProviderSettingsService;

  constructor(@Inject(AiProviderSettingsService) settings: AiProviderSettingsService) {
    this.settings = settings;
  }

  @Get()
  get(): Promise<IAiProviderSettingsStatus> {
    return this.settings.getStatus();
  }

  @Put()
  put(@Body() body: UpsertAiProviderSettingsDto): Promise<IAiProviderSettingsStatus> {
    return this.settings.upsert(body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(): Promise<void> {
    await this.settings.remove();
  }

  /** Lists the upstream `/models` (stored endpoint/key unless the body overrides them). */
  @Post('fetch-models')
  @HttpCode(HttpStatus.OK)
  async fetchModels(@Body() body: FetchAiProviderModelsDto): Promise<{ models: IUpstreamModel[] }> {
    return { models: await this.settings.listUpstreamModels(body) };
  }
}

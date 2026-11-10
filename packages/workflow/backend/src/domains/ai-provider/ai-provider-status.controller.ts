import { Controller, Get, Inject } from '@nestjs/common';
import {
  AiProviderSettingsService,
  type IAiProviderPublicStatus,
} from '../admin/app-settings/ai-provider-settings.service.js';

/**
 * `GET /ai-provider` — any signed-in user (the global JWT guard applies): whether the built-in AI provider is
 * configured and which models it offers, so the editor can show the instance switch and the model select
 * (ADR 0081 (private)). Never the endpoint or the key.
 */
@Controller('ai-provider')
export class AiProviderStatusController {
  private readonly settings: AiProviderSettingsService;

  constructor(@Inject(AiProviderSettingsService) settings: AiProviderSettingsService) {
    this.settings = settings;
  }

  @Get()
  get(): Promise<IAiProviderPublicStatus> {
    return this.settings.getPublicStatus();
  }
}

import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ProxySettingsService, type IEgressProxySettings } from '../admin/app-settings/proxy-settings.service.js';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';

/**
 * Pods/services read the egress proxy config here with their project token. See ADR 0056 (private).
 * The `:projectId` is only used by the guard (a leaked token reaches nothing but this one config).
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/egress-proxy')
export class InternalEgressProxyController {
  private readonly proxySettings: ProxySettingsService;

  constructor(@Inject(ProxySettingsService) proxySettings: ProxySettingsService) {
    this.proxySettings = proxySettings;
  }

  @Get(':projectId')
  async get(): Promise<{ proxy: IEgressProxySettings | null }> {
    return { proxy: await this.proxySettings.resolve() };
  }
}

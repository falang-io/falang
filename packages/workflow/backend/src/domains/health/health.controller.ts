import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';

/** Liveness/readiness probe target (`deploy/k8s/workflow/backend-deployment.yaml`). */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

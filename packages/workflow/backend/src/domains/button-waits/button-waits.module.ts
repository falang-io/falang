import { TEMPORAL_TENANCY, type ITemporalTenancy } from '@falang/workflow-gateway';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { createDescribeWorkflow } from '../tasks/create-signal-workflow.js';
import type { TDescribeWorkflow } from '../tasks/tasks.service.js';
import { ButtonWait } from './button-wait.entity.js';
import { BUTTON_WAIT_DESCRIBE_WORKFLOW, ButtonWaitsService } from './button-waits.service.js';
import { InternalButtonWaitsController } from './internal-button-waits.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ButtonWait]), ProjectTokenModule],
  controllers: [InternalButtonWaitsController],
  providers: [
    ButtonWaitsService,
    {
      provide: BUTTON_WAIT_DESCRIBE_WORKFLOW,
      inject: [TEMPORAL_TENANCY],
      useFactory: (tenancy: ITemporalTenancy): TDescribeWorkflow => createDescribeWorkflow(tenancy),
    },
  ],
  exports: [ButtonWaitsService],
})
export class ButtonWaitsModule {}

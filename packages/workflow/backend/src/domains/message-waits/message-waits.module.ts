import { TEMPORAL_TENANCY, type ITemporalTenancy } from '@falang/workflow-gateway';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { createDescribeWorkflow } from '../tasks/create-signal-workflow.js';
import type { TDescribeWorkflow } from '../tasks/tasks.service.js';
import { InternalMessageWaitsController } from './internal-message-waits.controller.js';
import { MessageWait } from './message-wait.entity.js';
import { MESSAGE_WAIT_DESCRIBE_WORKFLOW, MessageWaitsService } from './message-waits.service.js';

/** The registry of runs waiting for a chat message (ADR 0079 (private)): table, internal routes, the gateway port. */
@Module({
  imports: [TypeOrmModule.forFeature([MessageWait]), ProjectTokenModule],
  controllers: [InternalMessageWaitsController],
  providers: [
    MessageWaitsService,
    {
      provide: MESSAGE_WAIT_DESCRIBE_WORKFLOW,
      inject: [TEMPORAL_TENANCY],
      useFactory: (tenancy: ITemporalTenancy): TDescribeWorkflow => createDescribeWorkflow(tenancy),
    },
  ],
  exports: [MessageWaitsService],
})
export class MessageWaitsModule {}

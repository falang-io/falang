import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import { ProjectsModule } from '../../projects/projects/projects.module.js';
import { UsersModule } from '../../users/users/users.module.js';
import { AdminRunnerSessionsController } from './admin-runner-sessions.controller.js';
import { ProjectRunnerSessionsController } from './runner-sessions.controller.js';
import { RunnerSession } from './runner-session.entity.js';
import { RunnerSessionsService } from './runner-sessions.service.js';

/**
 * `RUNNER_SESSION_SINK` is deliberately not provided here: `RunnerSessionsService` injects it `@Optional()`, so a
 * `@Global()` module exporting that token (the hosted edition's meter) takes effect without touching this module.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RunnerSession, Project]), ProjectsModule, UsersModule],
  controllers: [ProjectRunnerSessionsController, AdminRunnerSessionsController],
  providers: [RunnerSessionsService],
  exports: [RunnerSessionsService],
})
export class RunnerSessionsModule {}

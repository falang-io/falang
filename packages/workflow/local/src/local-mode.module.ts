import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AuthModule, FILE_STORAGE_OVERRIDE, RUNNER_DEPLOYMENTS_CLIENT, UsersModule } from '@falang/workflow-backend';
import { LOCAL_CONTROL_OPTIONS, LocalControlController, type ILocalControlOptions } from './local-control.js';
import type { IFileStorage, IK8sDeploymentsClient } from '@falang/workflow-backend';

export interface ILocalModeModuleParams {
  readonly deploymentsClient: IK8sDeploymentsClient;
  readonly fileStorage: IFileStorage;
  readonly control: ILocalControlOptions;
}

/**
 * `@Global()` overlay module of local mode: replaces the Kubernetes deployments client with child processes and S3
 * with a directory. The backend injects both tokens `@Optional()` (same pattern as `AGENT_USAGE_SINK`), so the module
 * must be global and must export them.
 */
@Global()
@Module({})
export class LocalModeModule {
  static forRoot(params: ILocalModeModuleParams): DynamicModule {
    return {
      module: LocalModeModule,
      global: true,
      imports: [AuthModule, UsersModule],
      controllers: [LocalControlController],
      providers: [
        { provide: LOCAL_CONTROL_OPTIONS, useValue: params.control },
        { provide: RUNNER_DEPLOYMENTS_CLIENT, useValue: params.deploymentsClient },
        { provide: FILE_STORAGE_OVERRIDE, useValue: params.fileStorage },
      ],
      exports: [RUNNER_DEPLOYMENTS_CLIENT, FILE_STORAGE_OVERRIDE],
    };
  }
}

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FILE_UPLOAD_PORT } from '@falang/workflow-gateway';
import { UserLimitsModule } from '../admin/user-limits/user-limits.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { FILE_STORAGE } from './file-storage.js';
import { File } from './file.entity.js';
import { FileGcService } from './file-gc.service.js';
import { GatewayFileUploadPort } from './gateway-file-upload.port.js';
import { FilesService } from './files.service.js';
import { InternalFilesController } from './internal-files.controller.js';
import { ProjectFilesController } from './project-files.controller.js';
import { PublicFilesController } from './public-files.controller.js';
import { S3FileStorage } from './s3-file-storage.js';

/**
 * See ADR 0038 (private) §2/§4 and the fixed phase-2 contract.
 * `ProjectTokenModule` backs `InternalFilesController`'s `ProjectTokenGuard` (same as
 * `internal-credentials`/`internal-artifacts`); `ProjectsModule` backs `ProjectFilesController`'s
 * ownership check. Exports `FilesService` for `BuildModule` (project-delete cleanup, see
 * `BuildService.deleteProject`) and, later, the in-process Telegram-ingress path (§5) — neither
 * import creates a cycle, since nothing this module imports depends on either.
 */
@Module({
  imports: [TypeOrmModule.forFeature([File, Project]), UserLimitsModule, ProjectsModule, ProjectTokenModule],
  controllers: [InternalFilesController, PublicFilesController, ProjectFilesController],
  providers: [
    FilesService,
    FileGcService,
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3FileStorage({
          endpoint: config.get<string>('S3_ENDPOINT'),
          region: config.get<string>('S3_REGION', 'us-east-1'),
          bucket: config.get<string>('S3_BUCKET', 'falang-files'),
          accessKeyId: config.get<string>('S3_ACCESS_KEY', ''),
          secretAccessKey: config.get<string>('S3_SECRET_KEY', ''),
          forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false',
        }),
    },
    // `@falang/workflow-gateway`'s `IFileUploadPort`, registered under its own `FILE_UPLOAD_PORT`
    // token so `app.module.ts` can inject it into `GatewayModule.forRootAsync`'s
    // `resolveFileUploadPort` the same way `ProjectTokenService` backs `resolveInternalProjectToken` —
    // see ADR 0038 (private) §2/§5.
    { provide: FILE_UPLOAD_PORT, useClass: GatewayFileUploadPort },
  ],
  exports: [FilesService, FILE_UPLOAD_PORT],
})
export class FilesModule {}

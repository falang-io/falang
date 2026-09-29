import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserLimits } from './user-limits.entity.js';
import { UserLimitsService } from './user-limits.service.js';

/**
 * See ADR 0038 (private) §2. `AdminModule` owns
 * `AdminUserLimitsController` directly (mirroring `AppSettingsModule`'s own split — this module
 * exports only the service); `domains/files/`'s `FilesService` (a later phase) is the other
 * intended consumer of `UserLimitsService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserLimits])],
  providers: [UserLimitsService],
  exports: [UserLimitsService],
})
export class UserLimitsModule {}

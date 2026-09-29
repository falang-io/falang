import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { FilesService } from './files.service.js';

/** Same cadence as `RunnerIdleSweepService`'s own timer — not worth its own config knob. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Periodically deletes every `files` row whose `expiresAt` has passed (S3 object first, then the
 * row — `FilesService.removeExpired`) — see ADR 0038 (private) §2
 * ("Lifecycle"). Same timer shape as `RunnerIdleSweepService`.
 */
@Injectable()
export class FileGcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileGcService.name);
  private readonly filesService: FilesService;
  private handle: NodeJS.Timeout | undefined;

  constructor(@Inject(FilesService) filesService: FilesService) {
    this.filesService = filesService;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('File GC sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
  }

  private async sweep(): Promise<void> {
    const removed = await this.filesService.removeExpired(new Date());
    if (removed > 0) this.logger.log(`Removed ${removed} expired file(s)`);
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }
}

import { Module } from '@nestjs/common';
import { LogModule } from '../../system/log/Log.module';
import { SessionModule } from '../../user/session/Session.module';
import { UserModule } from '../../user/user/User.module';
import { LibraryDocumentModule } from '../document/LibraryDocument.module';
import { DocumentsController } from './controllers/Documents.controller';

@Module({
  imports: [
    LogModule,
    SessionModule,
    LibraryDocumentModule,
    UserModule,
    SessionModule,
  ],
  controllers: [DocumentsController],
})
export class DocumentHttpApiModule {}

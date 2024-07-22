import { Module } from '@nestjs/common';
import { DocumentHttpApiModule } from '../../domains/library/document-http-api/DocumentHttpApi.module';
import { getTypeormModule } from '../../domains/system/database/getTypeormModule';
import { getLoggerModule } from '../../domains/system/log/getLoggerModule';
import { UserHttpApiModule } from '../../domains/user/http-api/UserHttpApi.module';

@Module({
  imports: [
    getTypeormModule(),
    getLoggerModule(),
    DocumentHttpApiModule,
    UserHttpApiModule,
  ],
})
export class HttpApiServerModule {}

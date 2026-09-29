import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { TreeController } from './tree.controller.js';

@Module({
  imports: [FoldersModule, DocumentsModule],
  controllers: [TreeController],
})
export class TreeModule {}

import {
  Controller,
  UseGuards,
  Get,
  Post,
  Body,
  Put,
  Query,
  Delete,
  Request,
} from '@nestjs/common';
import { RequestResultDto } from '../../../system/dto/RequestResult.dto';
import { AuthUser } from '../../../user/session/decorators/AuthUser.decorator';
import { SessionAuthGuard } from '../../../user/session/passport/SessionAuth.guard';
import {
  DocumentDto,
  DocumentFilterDto,
  DocumentIdDto,
  DocumentListDto,
  ResponseDocumentDto,
} from '../../document/dto/Document.dto';
import {
  DocumentVersionFilterDto,
  DocumentVersionListDto,
} from '../../document/dto/DocumentVersion.dto';
import { DocumentService } from '../../document/services/Document.service';
import { DocumentVersionService } from '../../document/services/DocumentVersion.service';
import { Request as ExpressRequest } from 'express';

export interface IUserInfo {
  loggedIn: boolean;
  email: string | null;
  username: string | null;
}

@Controller('documents')
@UseGuards(SessionAuthGuard)
export class DocumentsController {
  constructor(
    private documents: DocumentService,
    private versions: DocumentVersionService,
  ) {}

  @Get('list')
  async getDocumentsList(
    @Query() filter: DocumentFilterDto,
    @Request() req: ExpressRequest,
  ): Promise<DocumentListDto> {
    return await this.documents.read(filter, req.user?.id ?? null);
  }

  @Get()
  async getSingleDocument(
    @Query() dto: DocumentIdDto,
    @Request() req: ExpressRequest,
  ): Promise<ResponseDocumentDto> {
    return this.documents.getForUser(dto.id, req.user?.id ?? null);
  }

  @Post('/create')
  async createDocument(
    @Body() dto: DocumentDto,
    @AuthUser('id') userId: number,
  ): Promise<ResponseDocumentDto> {
    return await this.documents.create(dto, userId);
  }

  @Put()
  async updateDocument(
    @Body() dto: DocumentDto,
    @AuthUser('id') userId: number,
  ): Promise<RequestResultDto> {
    await this.documents.update(dto, userId);
    return { success: true };
  }

  @Delete()
  async deleteDocument(
    @Body() dto: DocumentIdDto,
    @AuthUser('id') userId: number,
  ): Promise<RequestResultDto> {
    await this.documents.delete(dto.id, userId);
    return { success: true };
  }

  @Get('/versions')
  async getVersions(
    @Body() dto: DocumentVersionFilterDto,
    @AuthUser('id') userId: number,
  ): Promise<DocumentVersionListDto> {
    return this.versions.read(dto, userId);
  }
}

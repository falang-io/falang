import { RequestResultDto } from './system/dto/RequestResult.dto';
import { RegisterDto } from './user/registration/dto/Register.dto';
import { ConfirmationDto } from './user/user/dto/Confirmation.dto';
import { ChangePasswordDto, ResetPasswordDto, ResetPasswordFinishDto } from './user/user/dto/User.dto';
import { LoginDto } from './user/session/dto/Login.dto';
import { apiFactory, EmptyDto } from './apiFactory';
import { UserSessionInfoDto } from './user/http-api/dto/UserSessionInfo.dto';
import { DocumentDto, DocumentFilterDto, DocumentIdDto, DocumentListDto, ResponseDocumentDto } from './library/document/dto/Document.dto';
import { DocumentVersionFilterDto, DocumentVersionListDto } from './library/document/dto/DocumentVersion.dto';

export const api = {
  user: {
    registration: {
      resetPasswordStart: apiFactory('POST', 'user/registration/reset-password/start', ResetPasswordDto, RequestResultDto),
      resetPasswordFinish: apiFactory('POST', 'user/registration/reset-password/finish', ResetPasswordFinishDto, RequestResultDto),
      resetPasswordCheckCode: apiFactory('POST', 'user/registration/reset-password/check-code', ConfirmationDto, RequestResultDto),
      start: apiFactory('POST', 'user/registration/start', RegisterDto, RequestResultDto),
      activate: apiFactory('POST', 'user/registration/activate', ConfirmationDto, RequestResultDto),
    },
    profile: {
      changePassword: apiFactory('POST', 'user/profile/change-password', ChangePasswordDto, RequestResultDto),
    },
    session: {
      login: apiFactory('POST', 'user/session/login', LoginDto, UserSessionInfoDto),
      info: apiFactory('GET', 'user/session/info', EmptyDto, UserSessionInfoDto),
      logout: apiFactory('GET', 'user/session/logout', EmptyDto, RequestResultDto),
    }
  },
  documents: {
    getDocumentsList: apiFactory('GET', 'documents/list', DocumentFilterDto, DocumentListDto),
    getSingleDocument: apiFactory('GET', 'documents', DocumentIdDto, ResponseDocumentDto),
    createDocument: apiFactory('POST', 'documents/create', DocumentDto, ResponseDocumentDto),
    updateDocument: apiFactory('PUT', 'documents', DocumentDto, RequestResultDto),
    deleteDocument: apiFactory('DELETE', 'documents', DocumentIdDto, RequestResultDto),
    getVersions: apiFactory('GET', 'documents/versions', DocumentVersionFilterDto, DocumentVersionListDto),
  }
};

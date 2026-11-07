import { HttpException } from '@nestjs/common';
import type { ITableErrorBody, TTableErrorCode } from '@falang/workflow-dto';

const STATUS_BY_CODE: Record<TTableErrorCode, number> = {
  table_record_limit: 409,
  table_field_limit: 409,
  table_limit: 409,
  table_record_too_large: 413,
  validation: 400,
  record_not_found: 404,
  where_required: 400,
  unknown_field: 400,
  required_field: 400,
  field_removed: 400,
  version_conflict: 409,
  operator_not_supported: 400,
  file_not_found: 404,
  invalid_type: 400,
  invalid_option: 400,
  invalid_date: 400,
  invalid_file: 400,
};

/** An error of the tables routes; the body is `ITableErrorBody` (`{ statusCode, code, message, field? }`). */
export class TablesError extends HttpException {
  readonly code: TTableErrorCode;

  constructor(code: TTableErrorCode, message: string, field?: string) {
    const statusCode = STATUS_BY_CODE[code];
    const body: ITableErrorBody = { statusCode, code, message, ...((field ?? null) === null ? {} : { field }) };
    super(body, statusCode);
    this.code = code;
  }
}

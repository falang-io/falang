import { IsISO8601, IsOptional } from 'class-validator';

export class ListSupportMessagesDto {
  /** Only messages created strictly after this instant. */
  @IsOptional()
  @IsISO8601()
  after?: string;
}

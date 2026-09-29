import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

/** One `File` reference (ADR 0038 (private)) shown as a download link on the task page — see `ITaskAttachment`. */
export class TaskAttachmentDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  name!: string;

  @IsNumber()
  size!: number;

  @IsString()
  mime!: string;

  @IsOptional()
  @IsString()
  publicUrl?: string;
}

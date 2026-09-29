import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class LockDocumentDto {
  @IsString()
  @MinLength(1)
  owner!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMs?: number;
}

import { IsString, MinLength } from 'class-validator';

export class UnlockDocumentDto {
  @IsString()
  @MinLength(1)
  owner!: string;
}

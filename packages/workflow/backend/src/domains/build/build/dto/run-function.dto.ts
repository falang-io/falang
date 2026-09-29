import { IsArray, IsIn, IsString, MinLength } from 'class-validator';

export type TRunTarget = 'dev' | 'published';

export class RunFunctionDto {
  @IsString()
  @MinLength(1)
  functionName!: string;

  @IsIn(['dev', 'published'])
  target!: TRunTarget;

  /** Positional, in the function's declared parameter order — not deep-validated, see `CreateDocumentDto.root`. */
  @IsArray()
  args!: unknown[];
}

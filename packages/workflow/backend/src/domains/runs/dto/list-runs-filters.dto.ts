import { IsOptional, IsString } from 'class-validator';

/** All optional — see `RunsService.listRuns`, an absent field means "don't filter on this". */
export class ListRunsFiltersDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workflowName?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  buildId?: string;
}

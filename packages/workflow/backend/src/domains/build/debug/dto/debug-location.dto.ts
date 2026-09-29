import { IsString, MinLength } from 'class-validator';

/** A breakpoint as the client sends it — resolved to a compile-time trace index server-side via the dev build's `IDebugMap`, see `debug-map-resolver.ts`. */
export class DebugLocationDto {
  @IsString()
  @MinLength(1)
  documentId!: string;

  @IsString()
  @MinLength(1)
  nodeId!: string;
}

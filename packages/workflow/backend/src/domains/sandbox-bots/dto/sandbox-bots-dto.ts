// oxlint-disable max-classes-per-file -- two small DTOs of one admin surface.
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { COMMAND_NAME_PATTERN, MAX_BINDING_TTL_MINUTES } from '../sandbox-bot-settings.service.js';

export class SetSandboxBindingTtlDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BINDING_TTL_MINUTES)
  bindingTtlMinutes!: number;
}

export class UpsertSandboxBotDto {
  /** Omitted/empty keeps the stored token. */
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @Matches(COMMAND_NAME_PATTERN)
  commandName?: string;
}

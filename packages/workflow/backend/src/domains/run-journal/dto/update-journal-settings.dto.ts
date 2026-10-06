import { IsBoolean } from 'class-validator';

export class UpdateJournalSettingsDto {
  @IsBoolean()
  storeTexts!: boolean;
}

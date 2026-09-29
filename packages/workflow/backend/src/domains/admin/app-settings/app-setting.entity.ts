import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A generic deployment-wide key/value setting — not agent-specific. This table is the home for
 * every future application-wide setting, starting with `AgentSettingsService`'s `agent.*` keys.
 * See ADR 0031 (private).
 */
@Entity('app_settings')
export class AppSetting {
  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

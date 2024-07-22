import { SessionData } from 'express-session';
import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('Sessions')
export class Session {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id = '';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created: Date = new Date();

  @Column({ type: 'timestamp with time zone', nullable: false })
  expires: Date = new Date();

  @Column({ type: 'text' })
  data = '{}';

  getSessionData(): SessionData {
    return JSON.parse(this.data);
  }

  setSessionData(data: SessionData): void {
    this.data = JSON.stringify(data);
  }
}

import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { User } from './User.entity';

@Entity('UserConfirmCodes')
@Index(['type', 'userId'], { unique: true })
export class UserConfirmCode {
  @PrimaryGeneratedColumn()
  id: number = undefined as unknown as number;

  @Column({ type: 'varchar' })
  type = '';

  @Column({ type: 'varchar' })
  code = '';

  @Column({ type: 'int', nullable: false })
  userId = undefined as unknown as number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created = new Date();

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  expires = new Date();
}

import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('UsersPreregistered')
@Index(['email'], {
  unique: true,
  where: 'finished is null',
})
export class UserPreregistered {
  @PrimaryGeneratedColumn()
  id = 0;

  @Column({ type: 'varchar' })
  username = '';

  @Column({ type: 'varchar' })
  email = '';

  @Column({ type: 'varchar' })
  code = '';

  @Column({ type: 'varchar' })
  promo = '';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created = new Date();

  @Column({ type: 'timestamp with time zone', nullable: true })
  finished: Date | null = null;

  @Column({ type: 'boolean', default: false })
  success = false;
}

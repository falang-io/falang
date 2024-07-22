import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Users')
@Unique(['username_unique'])
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn()
  id = 0;

  @Column({ type: 'varchar', nullable: false })
  username = '';

  @Column({ type: 'varchar', nullable: false })
  username_unique = '';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created = new Date();

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated = new Date();

  @Column({ type: 'varchar', nullable: false })
  email = '';

  @Column({ type: 'varchar', nullable: false })
  passwordHash = '';

  @Column({ type: 'varchar', nullable: false })
  passwordSalt = '';

  @Column({ type: 'boolean', default: true })
  isActive = true;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastLogin: Date | null = null;

  get short() {
    return {
      id: this.id,
      username: this.username,
    };
  }
}

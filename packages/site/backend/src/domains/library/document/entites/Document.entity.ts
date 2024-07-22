import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { User } from '../../../user/user/entites/User.entity';
import { TDocumentVisibility } from '../dto/Document.dto';
import { DocumentVersion } from './DocumentVersion.entity';

@Entity('Documents')
export class Document {
  @PrimaryColumn({ type: 'varchar' })
  id = '';

  @Column({ type: 'varchar' })
  name = '';

  @Column({ type: 'varchar', default: 'text' })
  template = '';

  @Column({ type: 'varchar', default: 'text' })
  projectTemplate = '';

  @Column({ type: 'varchar', default: 'text' })
  schemeTemplate = '';

  @Column({ type: 'varchar', default: 'function' })
  icon = 'function';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created = new Date();

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated = new Date();

  @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
  deleted: Date | null = null;

  @Column({ type: 'int', nullable: false })
  userId = 0;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @OneToMany(() => DocumentVersion, (version) => version.document)
  versions?: DocumentVersion[];

  @Column({ type: 'varchar', nullable: false, default: 'private' })
  visibility: TDocumentVisibility = 'private';

  @Column({ type: 'boolean', default: false })
  moderatedForLibrary = false;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type TDocument = {} & Document;

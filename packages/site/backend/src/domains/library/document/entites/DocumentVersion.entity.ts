import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Document } from './Document.entity';

@Entity('DocumentVersions')
@Index('DocumentVersion_Latest_documentId_Unique', ['documentId'], {
  unique: true,
  where: 'latest = true',
})
@Index(['documentId', 'versionIndex'], { unique: true })
export class DocumentVersion {
  @PrimaryColumn({ type: 'varchar' })
  id = '';

  @Column({ type: 'varchar' })
  name = '';

  @Column({ type: 'varchar' })
  hash = '';

  @Column({ type: 'text' })
  description = '';

  @Column({ type: 'int' })
  versionIndex = 0;

  @Column({ type: 'varchar' })
  documentId = '';

  @Column({ type: 'varchar', nullable: true, default: null })
  tags: string | null = null;

  @Index('DocumentVersion_Latest', { where: 'latest = true' })
  @Column({ type: 'boolean', default: false })
  latest = false;

  @ManyToOne(() => Document, {
    cascade: true,
  })
  @JoinColumn({ name: 'documentId' })
  document = undefined as unknown as Document;

  @Column({ type: 'jsonb' })
  data: object = {};

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created = new Date();

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated = new Date();

  @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
  deleted: Date | null = null;
}

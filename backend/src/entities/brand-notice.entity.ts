import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 县域公共品牌风险说明 */
@Entity('brand_notices')
export class BrandNotice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  content: string;

  /** info/warning/critical */
  @Column({ default: 'info' })
  level: string;

  @Column({ name: 'batch_id', nullable: true })
  batchId: number;

  /** draft/published */
  @Column({ default: 'draft' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

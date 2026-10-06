import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 选品记录：运营对批次做样品试吃与质检决策 */
@Entity('selections')
export class Selection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'operator_id' })
  operatorId: number;

  /** 样品试吃评分 1-10 */
  @Column('int', { name: 'sample_taste_score', nullable: true })
  sampleTasteScore: number;

  @Column('text', { name: 'sample_notes', nullable: true })
  sampleNotes: string;

  /** pending/selected/rejected */
  @Column({ default: 'pending' })
  decision: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

@Entity('farmers')
export class Farmer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  region: string;

  @Column()
  contact: string;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  /** 交货稳定性评分 0-1，由履约历史动态计算 */
  @Column('float', { name: 'stability_score', default: 0.9 })
  stabilityScore: number;

  @Column('int', { name: 'total_batches', default: 0 })
  totalBatches: number;

  @Column('int', { name: 'fulfilled_batches', default: 0 })
  fulfilledBatches: number;

  /** 历史平均坏果率 */
  @Column('float', { name: 'avg_defect_rate', default: 0 })
  avgDefectRate: number;

  /** 历史售后率 */
  @Column('float', { name: 'aftersales_rate', default: 0 })
  aftersalesRate: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

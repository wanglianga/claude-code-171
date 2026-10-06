import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

@Entity('livestreams')
export class Livestream {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'anchor_name' })
  anchorName: string;

  /** 脚本要点 */
  @Column('text', { name: 'script_summary', nullable: true })
  scriptSummary: string;

  /** 主播承诺口径（如"现摘现发、坏果包赔"） */
  @Column('text', { name: 'promise_text', nullable: true })
  promiseText: string;

  /** 直播价 */
  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  /** 优惠券面额 */
  @Column('decimal', { name: 'coupon_amount', precision: 10, scale: 2, default: 0 })
  couponAmount: number;

  /** 预计销量 */
  @Column('int', { name: 'estimated_sales' })
  estimatedSales: number;

  /** 实际销量 */
  @Column('int', { name: 'actual_sales', default: 0 })
  actualSales: number;

  @Column({ type: 'timestamp', name: 'scheduled_at' })
  scheduledAt: Date;

  /** planned/locked/live/ended/cancelled */
  @Column({ default: 'planned' })
  status: string;

  /** 样品试吃是否完成 */
  @Column({ name: 'sample_taste_done', default: false })
  sampleTasteDone: boolean;

  @Column({ name: 'created_by' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

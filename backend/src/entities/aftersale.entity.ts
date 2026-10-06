import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

export const AFTERSALE_TYPES = [
  '坏果',
  '少发',
  '物流延误',
  '地址错误',
  '用户拒收',
  '口味不符',
];

@Entity('aftersales')
export class Aftersale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ticket_no', unique: true })
  ticketNo: string;

  @Column({ name: 'order_id' })
  orderId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  /** 坏果/少发/物流延误/地址错误/用户拒收/口味不符 */
  @Column()
  type: string;

  @Column('text')
  description: string;

  @Column('decimal', { name: 'refund_amount', precision: 10, scale: 2, default: 0 })
  refundAmount: number;

  /** pending/approved/rejected/resolved */
  @Column({ default: 'pending' })
  status: string;

  @Column('text', { nullable: true })
  resolution: string;

  @Column({ name: 'handled_by', nullable: true })
  handledBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'resolved_at', nullable: true })
  resolvedAt: Date;
}

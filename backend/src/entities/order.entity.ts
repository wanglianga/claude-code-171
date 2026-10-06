import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_no', unique: true })
  orderNo: string;

  @Column({ name: 'livestream_id' })
  livestreamId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column()
  phone: string;

  @Column()
  city: string;

  @Column()
  address: string;

  @Column('int')
  quantity: number;

  @Column('decimal', { name: 'unit_price', precision: 10, scale: 2 })
  unitPrice: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  /** paid/shipped/delivered/completed/refunded */
  @Column({ default: 'paid' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 发货任务：按订单+批次+发货仓+物流温区+售后承诺生成 */
@Entity('shipping_tasks')
export class ShippingTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_no', unique: true })
  taskNo: string;

  @Column({ name: 'order_id' })
  orderId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'warehouse_name' })
  warehouseName: string;

  /** 物流温区：常温/冷藏/冷冻 */
  @Column({ name: 'temp_zone' })
  tempZone: string;

  @Column({ nullable: true })
  carrier: string;

  /** 冷链车辆（冷链商品必填） */
  @Column({ name: 'cold_chain_vehicle', nullable: true })
  coldChainVehicle: string;

  /** 冷链车是否晚到 */
  @Column({ name: 'vehicle_late', default: false })
  vehicleLate: boolean;

  /** 随单售后承诺（坏果包赔/48h 送达等） */
  @Column('text', { name: 'promise_text', nullable: true })
  promiseText: string;

  /** pending/shipped/in_transit/delivered/exception */
  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'timestamp', name: 'shipped_at', nullable: true })
  shippedAt: Date;

  @Column({ type: 'timestamp', name: 'delivered_at', nullable: true })
  deliveredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

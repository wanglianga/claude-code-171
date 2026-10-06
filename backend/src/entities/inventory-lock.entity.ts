import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 库存与包材锁定（按直播排期） */
@Entity('inventory_locks')
export class InventoryLock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'livestream_id' })
  livestreamId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column('int', { name: 'locked_qty' })
  lockedQty: number;

  /** 包装材料 */
  @Column({ name: 'packaging_material' })
  packagingMaterial: string;

  @Column('int', { name: 'packaging_qty' })
  packagingQty: number;

  @Column({ name: 'warehouse_name' })
  warehouseName: string;

  /** locked/consumed/released */
  @Column({ default: 'locked' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

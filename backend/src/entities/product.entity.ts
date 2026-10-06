import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Farmer } from './farmer.entity';

export const PRODUCT_CATEGORIES = ['水果', '米面', '菌菇', '蜂蜜', '腊味'];

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** 水果/米面/菌菇/蜂蜜/腊味 */
  @Column()
  category: string;

  /** 产地 */
  @Column()
  origin: string;

  /** 规格，如 5kg/箱、单果 200g+ */
  @Column()
  spec: string;

  @Column({ default: '件' })
  unit: string;

  /** 保质期（天） */
  @Column('int', { name: 'shelf_life_days', default: 30 })
  shelfLifeDays: number;

  /** 是否需要冷链 */
  @Column({ name: 'cold_chain_required', default: false })
  coldChainRequired: boolean;

  /** 物流温区：常温/冷藏/冷冻 */
  @Column({ name: 'temp_zone', default: '常温' })
  tempZone: string;

  /** 包装方式 */
  @Column({ name: 'packaging_type', default: '普通纸箱' })
  packagingType: string;

  /** 包装耐压等级：高/中/低 */
  @Column({ name: 'pressure_resistance', default: '中' })
  pressureResistance: string;

  @Column('text', { nullable: true })
  description: string;

  /** submitted/approved/rejected */
  @Column({ default: 'submitted' })
  status: string;

  @Column({ name: 'review_note', nullable: true })
  reviewNote: string;

  @Column({ name: 'farmer_id' })
  farmerId: number;

  @ManyToOne(() => Farmer, { eager: true })
  @JoinColumn({ name: 'farmer_id' })
  farmer: Farmer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  /** 冷链可达城市（非持久化，查询时计算） */
  reachableCities?: string[];
}

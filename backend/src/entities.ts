import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Index
} from 'typeorm';

/** 角色：farmer 农户/合作社, operator 运营(含主播排期), warehouse 仓库, service 售后, county 县域管理方 */
export type UserRole = 'farmer' | 'operator' | 'warehouse' | 'service' | 'county';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) username: string;
  @Column() password: string;
  @Column() name: string;
  @Column({ type: 'varchar', length: 16 }) role: UserRole;
  /** farmer 角色关联的农户档案 */
  @Column({ type: 'int', nullable: true }) farmerId: number | null;
}

/** 农户 / 合作社档案 */
@Entity('farmers')
export class Farmer {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ default: '' }) contact: string;
  @Column({ default: '' }) region: string;
  /** 交货稳定性 0-100（准时足量交货） */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 80 }) stabilityScore: string;
  /** 历史准时交货率 */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 90 }) onTimeRate: string;
  /** 历史平均坏果率% */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 3 }) badRateAvg: string;
  /** 累计直播场次、销量、被复购率 */
  @Column({ type: 'int', default: 0 }) liveCount: number;
  @Column({ type: 'int', default: 0 }) totalSold: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 }) repurchaseRate: string;
  @Column({ default: 'active' }) status: string;
}

/** 商品申报（水果/米面/菌菇/蜂蜜/腊味） */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar', length: 16 }) category: string; // 水果 米面 菌菇 蜂蜜 腊味
  @Index()
  @Column({ type: 'int' }) farmerId: number;
  @Column({ default: '' }) origin: string;          // 产地
  @Column({ type: 'date', nullable: true }) harvestDate: string; // 采摘时间
  @Column({ default: '' }) spec: string;            // 规格
  @Column({ type: 'int', default: 0 }) stockQty: number;
  @Column({ type: 'int', default: 30 }) shelfLifeDays: number;  // 保质期
  @Column({ type: 'varchar', length: 16, default: '常温' }) coldChainRequirement: string; // 常温/冷藏/冷冻
  @Column({ default: '' }) testReportNo: string;
  @Column({ type: 'date', nullable: true }) testReportDate: string;
  @Column({ type: 'date', nullable: true }) testReportExpiry: string;
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 }) tastingScore: string; // 样品试吃评分
  @Column({ default: '' }) tastingNote: string;
  /** 包装耐压等级 1-5 */
  @Column({ type: 'int', default: 3 }) packagingPressure: number;
  /** 冷链可达城市（逗号分隔） */
  @Column({ default: '' }) coldChainCities: string;
  /** 农户自述商品承诺 */
  @Column({ type: 'text', default: '' }) promiseText: string;
  /** draft 草稿 / submitted 已申报 / selected 已选品 / rejected / on_shelf 已上架 */
  @Column({ type: 'varchar', length: 16, default: 'submitted' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 可供直播批次：库存锁定、质检、坏果率、履约都挂在批次上 */
@Entity('batches')
export class Batch {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) productId: number;
  @Column() batchNo: string;
  @Column({ type: 'date', nullable: true }) harvestDate: string;
  @Column({ type: 'int' }) qty: number;                 // 可供数量
  @Column({ type: 'int', default: 0 }) qtyLocked: number;
  @Column({ type: 'int', default: 0 }) qtySold: number;
  @Column({ type: 'date', nullable: true }) testReportExpiry: string;
  @Column({ type: 'varchar', length: 16, default: '常温' }) tempZone: string;
  /** 本批次实测坏果率% */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 }) badRate: string;
  /** available 可供 / locked 已锁 / short 临时少供 / closed 已结案 */
  @Column({ type: 'varchar', length: 16, default: 'available' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 运营选品结论：商品承诺 vs 真实履约能力 */
@Entity('selections')
export class Selection {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) productId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ type: 'int', nullable: true }) operatorId: number;
  /** 履约能力综合分 0-100 */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 }) fulfillScore: string;
  @Column({ type: 'text', default: '' }) scoreDetail: string;  // JSON 分项
  @Column({ type: 'text', default: '' }) gaps: string;        // JSON 承诺与能力差距
  @Column({ type: 'text', default: '' }) decisionNote: string;
  /** selected / rejected */
  @Column({ type: 'varchar', length: 16, default: 'selected' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 直播场次 */
@Entity('live_sessions')
export class LiveSession {
  @PrimaryGeneratedColumn() id: number;
  @Column() title: string;
  @Column({ default: '待安排主播' }) anchorName: string;
  @Column({ type: 'timestamp', nullable: true }) scheduledStart: Date;
  @Column({ type: 'text', default: '' }) scriptSummary: string;   // 脚本要点
  @Column({ default: '' }) sampleTasting: string;                // 样品试吃安排
  /** planned 已排期 / live 直播中 / finished 已结束 / cancelled */
  @Column({ type: 'varchar', length: 16, default: 'planned' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 直播排品：价格、优惠券、预计/预售量、主播口径承诺、实际销量 */
@Entity('live_items')
export class LiveItem {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) liveSessionId: number;
  @Column({ type: 'int' }) selectionId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ type: 'int' }) productId: number;
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 }) price: string;
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 }) coupon: string;
  @Column({ type: 'int', default: 0 }) estimatedSales: number;
  /** 据库存与稳定性下调后的建议预售量 */
  @Column({ type: 'int', default: 0 }) presaleQty: number;
  @Column({ type: 'int', default: 0 }) actualSoldQty: number;
  @Column({ type: 'text', default: '' }) anchorPromise: string;  // 主播口径承诺
  /** planned 待播 / locked 库存已锁 / live 在售 / sold_out 售罄 / ended 已截单 */
  @Column({ type: 'varchar', length: 16, default: 'planned' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 库存与包装材料锁定（仓库按直播排期） */
@Entity('inventory_locks')
export class InventoryLock {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) liveItemId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ default: '中心仓' }) warehouse: string;
  @Column({ type: 'int', default: 0 }) qtyLocked: number;
  @Column({ default: '标准泡沫箱+冰袋' }) packagingMaterial: string;
  @Column({ type: 'int', default: 0 }) packagingQty: number;
  /** locked 已锁 / released 已释放 / shipped 已出库 */
  @Column({ type: 'varchar', length: 16, default: 'locked' }) status: string;
  @CreateDateColumn() createdAt: Date;
}

/** 订单 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ unique: true }) orderNo: string;
  @Column({ type: 'int' }) liveItemId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ type: 'int' }) productId: number;
  @Column({ type: 'int' }) farmerId: number;
  @Column({ default: '消费者' }) customerName: string;
  @Column({ default: '' }) city: string;
  @Column({ default: '' }) address: string;
  @Column({ type: 'varchar', length: 16, default: '常温' }) tempZoneRequired: string;
  @Column({ type: 'int', default: 1 }) qty: number;
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 }) amount: string;
  /** paid 已支付待发货 / shipped 已发货 / delivered 已签收 / cancelled */
  @Column({ type: 'varchar', length: 16, default: 'paid' }) status: string;
  @Column({ default: '' }) courier: string;
  @Column({ default: '' }) trackingNo: string;
  @CreateDateColumn() createdAt: Date;
}

/** 发货任务（按订单+批次+发货仓+物流温区+售后承诺生成） */
@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) orderId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ default: '中心仓' }) warehouse: string;
  @Column({ default: '' }) carrier: string;
  @Column({ default: '' }) trackingNo: string;
  @Column({ type: 'varchar', length: 16, default: '常温' }) tempZone: string;
  /** 坏果包赔/少发补发/延误补偿等承诺 */
  @Column({ default: '坏果包赔，少发补发' }) promise: string;
  @Column({ type: 'timestamp', nullable: true }) plannedShipAt: Date;
  @Column({ type: 'timestamp', nullable: true }) shippedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) deliveredAt: Date;
  /** pending 待发 / cold_wait 等冷链车 / shipped 已发 / delayed 延误 / delivered 已签收 */
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status: string;
  @Column({ type: 'text', default: '' }) delayNote: string;
  @CreateDateColumn() createdAt: Date;
}

/** 售后单 */
@Entity('after_sales')
export class AfterSale {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) orderId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ type: 'int' }) productId: number;
  @Column({ type: 'int' }) farmerId: number;
  /** bad_fruit 坏果 / short 少发 / delay 物流延误 / wrong_address 地址错误 / rejected 用户拒收 / taste_mismatch 口味不符 */
  @Column({ type: 'varchar', length: 24 }) reason: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Column({ type: 'int', default: 1 }) qty: number;
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 }) claimAmount: string;
  /** refund 退款 / resend 补发 / discount 折价补偿 / reject 驳回 */
  @Column({ type: 'varchar', length: 16, default: '' }) resolution: string;
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 }) finalAmount: string;
  /** open 待处理 / handled 已处理 */
  @Column({ type: 'varchar', length: 16, default: 'open' }) status: string;
  /** 是否影响复购 / 是否建议下一场调整 */
  @Column({ type: 'boolean', default: false }) repurchaseHit: boolean;
  @Column({ type: 'text', default: '' }) handleNote: string;
  @Column({ type: 'int', nullable: true }) handledBy: number;
  @CreateDateColumn() createdAt: Date;
}

/** 农户结算（售后扣罚反映在结算里） */
@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'int' }) farmerId: number;
  @Column({ type: 'int' }) liveItemId: number;
  @Column({ type: 'int' }) batchId: number;
  @Column({ type: 'int', default: 0 }) qtySold: number;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) grossAmount: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) afterSaleDeduction: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) penalty: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) netAmount: string;
  /** pending 待结算 / settled 已结算 */
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status: string;
  @Column({ type: 'text', default: '' }) note: string;
  @CreateDateColumn() createdAt: Date;
}

/** 风险预警：超卖/少供/报告过期/冷链晚到/批次坏果率/承诺不符 */
@Entity('risk_alerts')
export class RiskAlert {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ type: 'varchar', length: 32 }) type: string;
  /** high / medium / low */
  @Column({ type: 'varchar', length: 8, default: 'medium' }) severity: string;
  @Column({ type: 'int', nullable: true }) batchId: number;
  @Column({ type: 'int', nullable: true }) liveItemId: number;
  @Column({ type: 'int', nullable: true }) farmerId: number;
  @Column({ type: 'text' }) message: string;
  @Column({ type: 'text', default: '' }) suggestion: string;
  /** open 未处理 / handled 已处置 / ignored */
  @Column({ type: 'varchar', length: 16, default: 'open' }) status: string;
  @Column({ type: 'text', default: '' }) handleNote: string;
  @CreateDateColumn() createdAt: Date;
}

/** 县域公共品牌风险说明 */
@Entity('brand_notices')
export class BrandNotice {
  @PrimaryGeneratedColumn() id: number;
  @Column() title: string;
  @Column({ type: 'text' }) content: string;
  @Column({ type: 'int', nullable: true }) batchId: number;
  @Column({ default: 'draft' }) status: string; // draft / published
  @Column({ type: 'timestamp', nullable: true }) publishedAt: Date;
  @CreateDateColumn() createdAt: Date;
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User, Farmer, Product, Batch, Selection, LiveSession, LiveItem, InventoryLock,
  Order, Shipment, AfterSale, Settlement, RiskAlert, BrandNotice,
} from './entities';
import { RiskService } from './risk.service';

const day = 86400000;
function dateStr(offset: number): string {
  return new Date(Date.now() + offset * day).toISOString().slice(0, 10);
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(Selection) private selectionRepo: Repository<Selection>,
    @InjectRepository(LiveSession) private liveRepo: Repository<LiveSession>,
    @InjectRepository(LiveItem) private liveItemRepo: Repository<LiveItem>,
    @InjectRepository(InventoryLock) private lockRepo: Repository<InventoryLock>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Shipment) private shipRepo: Repository<Shipment>,
    @InjectRepository(AfterSale) private afterRepo: Repository<AfterSale>,
    @InjectRepository(Settlement) private settleRepo: Repository<Settlement>,
    @InjectRepository(RiskAlert) private alertRepo: Repository<RiskAlert>,
    @InjectRepository(BrandNotice) private noticeRepo: Repository<BrandNotice>,
    private risk: RiskService,
  ) {}

  async run() {
    if ((await this.userRepo.count()) > 0) {
      // 已有数据时仍扫描一次批次风险，保证过期报告等预警随时间更新
      for (const b of await this.batchRepo.find()) await this.risk.checkBatch(b);
      return;
    }
    this.logger.log('首次启动，写入演示数据…');

    // ---------- 农户 / 合作社 ----------
    const f1 = await this.farmerRepo.save(this.farmerRepo.create({
      name: '青山猕猴桃合作社', contact: '周社长 138-0000-1001', region: '青山县·云栖镇',
      stabilityScore: '92', onTimeRate: '97', badRateAvg: '2.1', liveCount: 8, totalSold: 12600, repurchaseRate: '34',
    }));
    const f2 = await this.farmerRepo.save(this.farmerRepo.create({
      name: '白云高山菌菇农户', contact: '吴师傅 138-0000-1002', region: '白云乡·尖山村',
      stabilityScore: '61', onTimeRate: '74', badRateAvg: '6.8', liveCount: 3, totalSold: 2100, repurchaseRate: '15',
    }));
    const f3 = await this.farmerRepo.save(this.farmerRepo.create({
      name: '西坡土蜂养殖场', contact: '郑阿姨 138-0000-1003', region: '西坡镇·花溪沟',
      stabilityScore: '85', onTimeRate: '91', badRateAvg: '0.8', liveCount: 5, totalSold: 5400, repurchaseRate: '41',
    }));
    const f4 = await this.farmerRepo.save(this.farmerRepo.create({
      name: '南岭腊味工坊', contact: '陈师傅 138-0000-1004', region: '南岭镇',
      stabilityScore: '78', onTimeRate: '88', badRateAvg: '1.5', liveCount: 2, totalSold: 1800, repurchaseRate: '28',
    }));

    // ---------- 账号 ----------
    const mkUser = (username: string, name: string, role: any, farmerId: number | null = null) =>
      this.userRepo.save(this.userRepo.create({ username, password: '123456', name, role, farmerId }));
    await mkUser('admin', '县域运营管理员', 'county');
    await mkUser('op', '选品运营小林', 'operator');
    await mkUser('wh', '仓库主管老赵', 'warehouse');
    await mkUser('cs', '售后客服小秦', 'service');
    await mkUser('farmer1', '青山猕猴桃合作社', 'farmer', f1.id);
    await mkUser('farmer2', '白云菌菇农户', 'farmer', f2.id);

    // ---------- 商品申报 ----------
    const p1 = await this.productRepo.save(this.productRepo.create({
      name: '云栖红心猕猴桃', category: '水果', farmerId: f1.id, origin: '青山县云栖镇海拔800米果园',
      harvestDate: dateStr(-3), spec: '24枚装 单果80-100g 净重4.5斤', stockQty: 3000, shelfLifeDays: 20,
      coldChainRequirement: '冷藏', testReportNo: 'QS2026-MHT-0918', testReportDate: dateStr(-18), testReportExpiry: dateStr(42),
      tastingScore: '9.0', tastingNote: '八分甜两分酸，果肉细腻，试吃好评率高', packagingPressure: 4,
      coldChainCities: '杭州,上海,南京,苏州,宁波,合肥,武汉,南昌,长沙,无锡,温州,绍兴',
      promiseText: '产地现摘冷藏直发，坏果包赔，48小时内冷链发出，八分甜两分酸', status: 'selected',
    }));
    const p2 = await this.productRepo.save(this.productRepo.create({
      name: '尖山高山香菇（鲜）', category: '菌菇', farmerId: f2.id, origin: '白云乡尖山村椴木菇棚',
      harvestDate: dateStr(-5), spec: '净重2斤 精选中朵', stockQty: 800, shelfLifeDays: 7,
      coldChainRequirement: '冷藏', testReportNo: 'QS2026-GU-0820', testReportDate: dateStr(-50), testReportExpiry: dateStr(-5),
      tastingScore: '7.2', tastingNote: '香气足但批次口感差异较大', packagingPressure: 2,
      coldChainCities: '杭州,上海', promiseText: '高山椴木香菇零农残，次日达，包甜包新鲜', status: 'submitted',
    }));
    const p3 = await this.productRepo.save(this.productRepo.create({
      name: '花溪沟百花土蜂蜜', category: '蜂蜜', farmerId: f3.id, origin: '西坡镇花溪沟中蜂养殖点',
      harvestDate: dateStr(-40), spec: '玻璃瓶 500g/瓶', stockQty: 1500, shelfLifeDays: 540,
      coldChainRequirement: '常温', testReportNo: 'QS2026-FM-0830', testReportDate: dateStr(-37), testReportExpiry: dateStr(328),
      tastingScore: '9.3', tastingNote: '花香明显，结晶细腻，复购口碑好', packagingPressure: 5,
      coldChainCities: '', promiseText: '成熟封盖蜜，足斤足两，破损包赔', status: 'selected',
    }));
    const p4 = await this.productRepo.save(this.productRepo.create({
      name: '南岭古法腊肠', category: '腊味', farmerId: f4.id, origin: '南岭镇传统腊味工坊',
      harvestDate: dateStr(-15), spec: '500g 真空装 八分瘦', stockQty: 600, shelfLifeDays: 90,
      coldChainRequirement: '常温', testReportNo: 'QS2026-LW-0910', testReportDate: dateStr(-26), testReportExpiry: dateStr(64),
      tastingScore: '8.4', tastingNote: '酒香浓郁，咸淡适中', packagingPressure: 4,
      coldChainCities: '', promiseText: '古法工艺纯肉灌装，足斤足两', status: 'submitted',
    }));
    const p5 = await this.productRepo.save(this.productRepo.create({
      name: '云栖高山生态大米', category: '米面', farmerId: f1.id, origin: '青山县云栖镇梯田',
      harvestDate: dateStr(-90), spec: '5kg 真空袋装', stockQty: 5000, shelfLifeDays: 180,
      coldChainRequirement: '常温', testReportNo: 'QS2026-DM-0701', testReportDate: dateStr(-97), testReportExpiry: dateStr(268),
      tastingScore: '8.1', tastingNote: '口感软糯，适合煮饭', packagingPressure: 5,
      coldChainCities: '', promiseText: '当年新米，不抛光不打蜡', status: 'selected',
    }));

    // ---------- 批次 ----------
    const b1 = await this.batchRepo.save(this.batchRepo.create({
      productId: p1.id, batchNo: 'MHT-20261003-A', harvestDate: dateStr(-3), qty: 3000,
      testReportExpiry: dateStr(42), tempZone: '冷藏', badRate: '2.3', status: 'available',
    }));
    const b2 = await this.batchRepo.save(this.batchRepo.create({
      productId: p2.id, batchNo: 'GU-20261001-A', harvestDate: dateStr(-5), qty: 800,
      testReportExpiry: dateStr(-5), tempZone: '冷藏', badRate: '6.2', status: 'available',
    }));
    const b3 = await this.batchRepo.save(this.batchRepo.create({
      productId: p3.id, batchNo: 'FM-20260827-A', harvestDate: dateStr(-40), qty: 1500,
      testReportExpiry: dateStr(328), tempZone: '常温', badRate: '0.6', status: 'available',
    }));
    const b5 = await this.batchRepo.save(this.batchRepo.create({
      productId: p5.id, batchNo: 'DM-20260708-A', harvestDate: dateStr(-90), qty: 5000,
      testReportExpiry: dateStr(268), tempZone: '常温', badRate: '1.0', status: 'available',
    }));
    // 上一场直播的老批次：已有订单、售后、结算（坏果率升高案例）
    const b1old = await this.batchRepo.save(this.batchRepo.create({
      productId: p1.id, batchNo: 'MHT-20260920-A', harvestDate: dateStr(-16), qty: 1200, qtyLocked: 1200, qtySold: 1180,
      testReportExpiry: dateStr(30), tempZone: '冷藏', badRate: '9.4', status: 'closed',
    }));

    // ---------- 选品 ----------
    const selOld = await this.selectionRepo.save(this.selectionRepo.create({
      productId: p1.id, batchId: b1old.id, operatorId: 2,
      fulfillScore: '84', status: 'selected',
      scoreDetail: JSON.stringify([
        { label: '检测报告', score: 20, max: 20 }, { label: '采摘窗口', score: 13, max: 15 },
        { label: '样品口感', score: 13, max: 15 }, { label: '包装耐压', score: 12, max: 15 },
        { label: '冷链可达', score: 12, max: 15 }, { label: '农户交货稳定性', score: 14, max: 20 },
      ]),
      gaps: JSON.stringify([{ point: '甜度承诺', promise: '“纯甜”', reality: '样品为酸甜口', suggestion: '统一口径为“八分甜两分酸”' }]),
      decisionNote: '首发主推，但口播“纯甜”表述需在脚本评审中改正',
    }));
    const sel1 = await this.selectionRepo.save(this.selectionRepo.create({
      productId: p1.id, batchId: b1.id, operatorId: 2,
      fulfillScore: '88', status: 'selected',
      scoreDetail: JSON.stringify([
        { label: '检测报告', score: 20, max: 20 }, { label: '采摘窗口', score: 13, max: 15 },
        { label: '样品口感', score: 14, max: 15 }, { label: '包装耐压', score: 12, max: 15 },
        { label: '冷链可达', score: 15, max: 15 }, { label: '农户交货稳定性', score: 18, max: 20 },
      ]),
      gaps: JSON.stringify([]), decisionNote: '履约能力强，冷链覆盖好，建议主推；继续保持“八分甜两分酸”口径',
    }));
    const sel3 = await this.selectionRepo.save(this.selectionRepo.create({
      productId: p3.id, batchId: b3.id, operatorId: 2,
      fulfillScore: '91', status: 'selected',
      scoreDetail: JSON.stringify([
        { label: '检测报告', score: 20, max: 20 }, { label: '采摘窗口', score: 15, max: 15 },
        { label: '样品口感', score: 14, max: 15 }, { label: '包装耐压', score: 15, max: 15 },
        { label: '冷链可达', score: 15, max: 15 }, { label: '农户交货稳定性', score: 17, max: 20 },
      ]),
      gaps: JSON.stringify([]), decisionNote: '高复购品，适合作为直播间常驻款',
    }));
    await this.productRepo.update(p5.id, { status: 'selected' });

    // ---------- 直播场次 ----------
    const live1 = await this.liveRepo.save(this.liveRepo.create({
      title: '9·20 青山农特产专场（已结束）', anchorName: '主播·果果',
      scheduledStart: new Date(Date.now() - 16 * day), status: 'finished',
      scriptSummary: '主推红心猕猴桃，强调产地现摘、坏果包赔', sampleTasting: '直播现场切果试吃',
    }));
    const live2 = await this.liveRepo.save(this.liveRepo.create({
      title: '10·8 金秋丰收节专场（待播）', anchorName: '主播·果果',
      scheduledStart: new Date(Date.now() + 2 * day), status: 'planned',
      scriptSummary: '猕猴桃主推 + 土蜂蜜常驻 + 生态大米福利款', sampleTasting: '提前2天到样，直播现场试吃',
    }));

    // 老场次排品（已截单）
    const liOld = await this.liveItemRepo.save(this.liveItemRepo.create({
      liveSessionId: live1.id, selectionId: selOld.id, batchId: b1old.id, productId: p1.id,
      price: '39.90', coupon: '5.00', estimatedSales: 1000, presaleQty: 1000, actualSoldQty: 1180,
      anchorPromise: '单果80g起，坏果包赔，48小时冷链发出', status: 'ended',
    }));
    await this.lockRepo.save(this.lockRepo.create({
      liveItemId: liOld.id, batchId: b1old.id, warehouse: '中心仓', qtyLocked: 1200,
      packagingMaterial: '泡沫箱+冰袋+缓冲隔板', packagingQty: 1200, status: 'shipped',
    }));

    // 待播场次排品（已选品、待锁库存）
    const li1 = await this.liveItemRepo.save(this.liveItemRepo.create({
      liveSessionId: live2.id, selectionId: sel1.id, batchId: b1.id, productId: p1.id,
      price: '39.90', coupon: '5.00', estimatedSales: 2500, presaleQty: 2500,
      anchorPromise: '单果80-100g，八分甜两分酸，坏果包赔，48小时冷链发出', status: 'planned',
    }));
    const li3 = await this.liveItemRepo.save(this.liveItemRepo.create({
      liveSessionId: live2.id, selectionId: sel3.id, batchId: b3.id, productId: p3.id,
      price: '68.00', coupon: '8.00', estimatedSales: 800, presaleQty: 800,
      anchorPromise: '成熟封盖百花蜜，足斤足两，破损包赔', status: 'planned',
    }));

    // ---------- 老场次订单 / 发货 / 售后 ----------
    const cities = ['杭州', '上海', '南京', '苏州', '宁波'];
    const couriers = ['顺丰冷链', '京东冷链'];
    for (let i = 0; i < 12; i++) {
      const city = cities[i % cities.length];
      const order = await this.orderRepo.save(this.orderRepo.create({
        orderNo: `SO2026092${String(i + 1).padStart(3, '0')}`, liveItemId: liOld.id, batchId: b1old.id,
        productId: p1.id, farmerId: f1.id, customerName: `消费者${i + 1}`, city,
        address: `${city}市示例路${i + 8}号`, tempZoneRequired: '冷藏', qty: 1, amount: '34.90',
        status: i < 9 ? 'delivered' : 'shipped', courier: couriers[i % 2], trackingNo: `SF${1000 + i}`,
      }));
      const delayed = i === 3;
      const ship = await this.shipRepo.save(this.shipRepo.create({
        orderId: order.id, batchId: b1old.id, warehouse: '中心仓', carrier: couriers[i % 2],
        trackingNo: `SF${1000 + i}`, tempZone: '冷藏', promise: '坏果包赔，少发补发，延误补偿优惠券',
        plannedShipAt: new Date(Date.now() - 14 * day),
        shippedAt: new Date(Date.now() - (delayed ? 12 : 14) * day),
        deliveredAt: i < 9 ? new Date(Date.now() - (delayed ? 9 : 12) * day) : null,
        status: i < 9 ? 'delivered' : 'shipped',
        delayNote: delayed ? '冷链车晚到180分钟，发运顺延1天' : '',
      }));
      if (i === 1 || i === 6) {
        await this.afterRepo.save(this.afterRepo.create({
          orderId: order.id, batchId: b1old.id, productId: p1.id, farmerId: f1.id,
          reason: 'bad_fruit', description: '收到后切开有3枚软烂', qty: 3, claimAmount: '12.00',
          resolution: 'refund', finalAmount: '12.00', status: 'handled', repurchaseHit: true,
          handleNote: '按坏果包赔原路退款，反馈批次坏果率偏高，已建议全检', handledBy: 4,
        }));
      }
      if (i === 3) {
        await this.afterRepo.save(this.afterRepo.create({
          orderId: order.id, batchId: b1old.id, productId: p1.id, farmerId: f1.id,
          reason: 'delay', description: '冷链车晚到，签收比承诺晚1天', qty: 1, claimAmount: '5.00',
          resolution: 'discount', finalAmount: '5.00', status: 'handled', repurchaseHit: false,
          handleNote: '补偿5元无门槛券', handledBy: 4,
        }));
      }
      if (i === 8) {
        await this.afterRepo.save(this.afterRepo.create({
          orderId: order.id, batchId: b1old.id, productId: p1.id, farmerId: f1.id,
          reason: 'taste_mismatch', description: '主播说纯甜，实际偏酸，家里老人吃不惯', qty: 1, claimAmount: '34.90',
          resolution: 'refund', finalAmount: '20.00', status: 'open', repurchaseHit: true,
        }));
      }
    }
    // 一条少发售后
    const oShort = await this.orderRepo.save(this.orderRepo.create({
      orderNo: 'SO2026092013', liveItemId: liOld.id, batchId: b1old.id, productId: p1.id, farmerId: f1.id,
      customerName: '消费者13', city: '合肥', address: '合肥市示例路13号', tempZoneRequired: '冷藏',
      qty: 2, amount: '69.80', status: 'delivered', courier: '顺丰冷链', trackingNo: 'SF1013',
    }));
    await this.afterRepo.save(this.afterRepo.create({
      orderId: oShort.id, batchId: b1old.id, productId: p1.id, farmerId: f1.id,
      reason: 'short', description: '下单2箱只收到1箱', qty: 1, claimAmount: '34.90',
      resolution: 'resend', finalAmount: '34.90', status: 'handled', repurchaseHit: false,
      handleNote: '仓库核单后补发1箱并致歉', handledBy: 4,
    }));

    // ---------- 结算（老批次） ----------
    await this.settleRepo.save(this.settleRepo.create({
      farmerId: f1.id, liveItemId: liOld.id, batchId: b1old.id, qtySold: 1180,
      grossAmount: (1180 * 34.9).toFixed(2), afterSaleDeduction: '97.80', penalty: '823.64',
      netAmount: (1180 * 34.9 - 97.8 - 823.64).toFixed(2), status: 'pending',
      note: '坏果率9.4%超过红线，按销售额2%计品质违约金；售后实退97.8元另扣',
    }));

    // ---------- 预警 ----------
    await this.alertRepo.save(this.alertRepo.create({
      type: 'batch_bad_rate', severity: 'high', batchId: b1old.id, farmerId: f1.id,
      message: '批次 MHT-20260920-A 坏果率升至 9.4%，超过 8% 红线',
      suggestion: '暂停同品发货并全检；已发订单主动赔付；复盘采摘与包装环节', status: 'open',
    }));
    await this.alertRepo.save(this.alertRepo.create({
      type: 'cold_chain_late', severity: 'medium', batchId: b1old.id,
      message: '冷链车晚到 180 分钟（批次 MHT-20260920-A）：高速封路',
      suggestion: '向延误客户推送告知并补偿优惠券，旺季增加备用冷链车', status: 'handled',
      handleNote: '已逐单通知并补偿',
    }));
    await this.alertRepo.save(this.alertRepo.create({
      type: 'promise_mismatch', severity: 'high', batchId: b1old.id, farmerId: f1.id,
      message: '主播承诺与实际规格不一致（批次 MHT-20260920-A）：口播“纯甜”，商品实际为酸甜口',
      suggestion: '统一口径为“八分甜两分酸”，下一场脚本评审重点核对口感描述', status: 'open',
    }));

    // ---------- 县域品牌风险说明（草稿） ----------
    await this.noticeRepo.save(this.noticeRepo.create({
      title: '关于9·20专场猕猴桃批次口感与赔付的说明（草稿）',
      content: '近期收到部分消费者反馈红心猕猴桃酸甜度与直播口播存在差异，且个别包裹出现坏果。县域公共品牌运营中心已督促合作社按“坏果包赔”承诺完成赔付，并统一主播口径为“八分甜两分酸”。后续将加强批次抽检与冷链时效管理。',
      batchId: b1old.id, status: 'draft',
    }));

    // 动态扫描：批次 b2 报告已过期，应自动生成高优预警
    for (const b of [b1, b2, b3, b5, b1old]) await this.risk.checkBatch(b);

    this.logger.log('演示数据写入完成。测试账号：admin/op/wh/cs/farmer1/farmer2，密码均为 123456');
  }
}

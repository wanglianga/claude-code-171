import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtGuard } from '../jwt.guard';
import {
  Farmer, Product, Batch, LiveItem, LiveSession, Order, AfterSale, RiskAlert, Settlement,
  Shipment, InventoryLock,
} from '../entities';

@UseGuards(JwtGuard)
@Controller('insights')
export class InsightController {
  constructor(
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(LiveItem) private itemRepo: Repository<LiveItem>,
    @InjectRepository(LiveSession) private liveRepo: Repository<LiveSession>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(AfterSale) private afterRepo: Repository<AfterSale>,
    @InjectRepository(RiskAlert) private alertRepo: Repository<RiskAlert>,
    @InjectRepository(Settlement) private settleRepo: Repository<Settlement>,
    @InjectRepository(Shipment) private shipRepo: Repository<Shipment>,
    @InjectRepository(InventoryLock) private lockRepo: Repository<InventoryLock>,
  ) {}

  /** 总览：关键指标 + 未处置预警 */
  @Get('overview')
  async overview() {
    const [products, batches, sessions, items, orders, afters, openAlerts, farmers] = await Promise.all([
      this.productRepo.find(), this.batchRepo.find(), this.liveRepo.find(),
      this.itemRepo.find(), this.orderRepo.find(), this.afterRepo.find(),
      this.alertRepo.find({ where: { status: 'open' }, order: { id: 'DESC' } }),
      this.farmerRepo.find(),
    ]);
    const gmv = items.reduce((s, i) => s + i.actualSoldQty * (Number(i.price) - Number(i.coupon)), 0);
    const afterRate = orders.length ? +(afters.length / orders.length * 100).toFixed(1) : 0;
    const repurchaseHits = afters.filter(a => a.repurchaseHit).length;
    return {
      kpi: {
        farmerCount: farmers.length,
        productCount: products.length,
        selectedCount: products.filter(p => p.status === 'selected').length,
        liveCount: sessions.length,
        plannedLiveCount: sessions.filter(s => s.status === 'planned').length,
        orderCount: orders.length,
        gmv: +gmv.toFixed(2),
        afterSaleCount: afters.length,
        afterRate,
        openAlertCount: openAlerts.length,
        highAlertCount: openAlerts.filter(a => a.severity === 'high').length,
        repurchaseHitCount: repurchaseHits,
      },
      alerts: openAlerts.slice(0, 8),
    };
  }

  /** 复盘1：哪些农户稳定（稳定性、准时率、坏果率、售后、销售贡献综合） */
  @Get('farmers')
  async farmerReview() {
    const farmers = await this.farmerRepo.find();
    const products = await this.productRepo.find();
    const batches = await this.batchRepo.find();
    const orders = await this.orderRepo.find();
    const afters = await this.afterRepo.find();
    const items = await this.itemRepo.find();
    return farmers.map(f => {
      const pids = new Set(products.filter(p => p.farmerId === f.id).map(p => p.id));
      const bIds = new Set(batches.filter(b => pids.has(b.productId)).map(b => b.id));
      const fOrders = orders.filter(o => o.farmerId === f.id);
      const fAfters = afters.filter(a => a.farmerId === f.id);
      const fItems = items.filter(i => pids.has(i.productId));
      const forecastAcc = fItems.length
        ? Math.round(fItems.reduce((s, i) => s + Math.min(i.actualSoldQty, i.estimatedSales || 1) / Math.max(i.actualSoldQty, i.estimatedSales || 1, 1), 0) / fItems.length * 100)
        : null;
      const sold = fOrders.reduce((s, o) => s + o.qty, 0) || f.totalSold;
      const stability = Number(f.stabilityScore);
      return {
        id: f.id, name: f.name, region: f.region,
        stabilityScore: stability, onTimeRate: Number(f.onTimeRate),
        badRateAvg: Number(f.badRateAvg), repurchaseRate: Number(f.repurchaseRate),
        liveCount: f.liveCount, sold,
        orderCount: fOrders.length, afterSaleCount: fAfters.length,
        badFruitCount: fAfters.filter(a => a.reason === 'bad_fruit').length,
        forecastAccuracy: forecastAcc,
        verdict: stability >= 85 ? '稳定核心农户，可加大排期' : stability >= 70 ? '基本稳定，需控制预售量' : '波动较大，暂缓主推、先整改',
      };
    }).sort((a, b) => b.stabilityScore - a.stabilityScore);
  }

  /** 复盘2：哪些品类适合直播（销量、转化相对预估、售后率、坏果/口感问题） */
  @Get('categories')
  async categoryReview() {
    const products = await this.productRepo.find();
    const items = await this.itemRepo.find();
    const orders = await this.orderRepo.find();
    const afters = await this.afterRepo.find();
    const map = new Map<string, {
      category: string; productCount: number; sold: number; gmv: number;
      estimate: number; afterCount: number; badCount: number; tasteCount: number;
    }>();
    for (const p of products) {
      if (!map.has(p.category)) map.set(p.category, {
        category: p.category, productCount: 0, sold: 0, gmv: 0, estimate: 0,
        afterCount: 0, badCount: 0, tasteCount: 0,
      });
      const row = map.get(p.category)!;
      row.productCount++;
    }
    const pmap = new Map(products.map(p => [p.id, p]));
    for (const it of items) {
      const p = pmap.get(it.productId);
      if (!p) continue;
      const row = map.get(p.category)!;
      row.sold += it.actualSoldQty;
      row.estimate += it.estimatedSales;
      row.gmv += it.actualSoldQty * (Number(it.price) - Number(it.coupon));
    }
    for (const a of afters) {
      const p = pmap.get(a.productId);
      if (!p) continue;
      const row = map.get(p.category)!;
      row.afterCount++;
      if (a.reason === 'bad_fruit') row.badCount++;
      if (a.reason === 'taste_mismatch') row.tasteCount++;
    }
    return [...map.values()].map(r => {
      const achieve = r.estimate ? Math.round(r.sold / r.estimate * 100) : 0;
      let verdict = '适合直播，可扩大场次';
      if (r.tasteCount > 0) verdict = '可播但需统一口感口径';
      if (r.badCount >= 2) verdict = '售后风险高，先解决品控与包装';
      if (achieve > 0 && achieve < 60) verdict = '动销偏弱，调整价格/脚本或减少排期';
      return { ...r, gmv: +r.gmv.toFixed(2), achieveRate: achieve, verdict };
    }).sort((a, b) => b.gmv - a.gmv);
  }

  /** 复盘3：哪些售后原因影响复购 */
  @Get('after-sale-reasons')
  async reasonReview() {
    const afters = await this.afterRepo.find();
    const orders = await this.orderRepo.find();
    const reasons: Record<string, string> = {
      bad_fruit: '坏果', short: '少发', delay: '物流延误',
      wrong_address: '地址错误', rejected: '用户拒收', taste_mismatch: '口味不符',
    };
    return Object.entries(reasons).map(([key, label]) => {
      const list = afters.filter(a => a.reason === key);
      const hit = list.filter(a => a.repurchaseHit).length;
      const handled = list.filter(a => a.status === 'handled').length;
      const amount = list.filter(a => a.status === 'handled').reduce((s, a) => s + Number(a.finalAmount), 0);
      return {
        reason: key, label, count: list.length, handled, open: list.length - handled,
        repurchaseHit: hit,
        repurchaseHitRate: list.length ? Math.round(hit / list.length * 100) : 0,
        cost: +amount.toFixed(2),
        share: afters.length ? Math.round(list.length / afters.length * 100) : 0,
      };
    }).sort((a, b) => b.count - a.count);
  }

  /** 复盘4：批次履约漏斗（选品→锁库存→售出→发货→售后→结算） */
  @Get('batch-funnel')
  async funnel() {
    const [batches, items, locks, orders, afters, shipments, settlements] = await Promise.all([
      this.batchRepo.find(), this.itemRepo.find(), this.lockRepo.find(),
      this.orderRepo.find(), this.afterRepo.find(), this.shipRepo.find(), this.settleRepo.find(),
    ]);
    return {
      batches: batches.length,
      batchesAvailable: batches.filter(b => b.status === 'available').length,
      batchesShort: batches.filter(b => b.status === 'short').length,
      liveItems: items.length,
      lockedQty: locks.filter(l => l.status !== 'released').reduce((s, l) => s + l.qtyLocked, 0),
      soldQty: orders.reduce((s, o) => s + o.qty, 0),
      shippedOrders: shipments.filter(s => ['shipped', 'delivered'].includes(s.status)).length,
      deliveredOrders: shipments.filter(s => s.status === 'delivered').length,
      afterSales: afters.length,
      settlements: settlements.length,
      settledAmount: +settlements.filter(s => s.status === 'settled').reduce((a, s) => a + Number(s.netAmount), 0).toFixed(2),
    };
  }
}

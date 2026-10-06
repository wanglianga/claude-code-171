import {
  Body, Controller, Get, Param, Post, Query, Req, UseGuards, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtGuard } from '../jwt.guard';
import {
  Order, Shipment, AfterSale, Batch, LiveItem, Product, Farmer, LiveSession,
  InventoryLock, Selection, RiskAlert, Settlement,
} from '../entities';
import { RiskService } from '../risk.service';

let orderSeq = 100;

@UseGuards(JwtGuard)
@Controller()
export class FulfillController {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Shipment) private shipRepo: Repository<Shipment>,
    @InjectRepository(AfterSale) private afterRepo: Repository<AfterSale>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(LiveItem) private liveItemRepo: Repository<LiveItem>,
    @InjectRepository(LiveSession) private liveRepo: Repository<LiveSession>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(InventoryLock) private lockRepo: Repository<InventoryLock>,
    @InjectRepository(Settlement) private settleRepo: Repository<Settlement>,
    private risk: RiskService,
  ) {}

  // ---------- 订单（模拟直播下单） ----------
  @Get('orders')
  async orders(@Query('batchId') batchId: string, @Query('status') status: string) {
    const where: any = {};
    if (batchId) where.batchId = Number(batchId);
    if (status) where.status = status;
    const list = await this.orderRepo.find({ where, order: { id: 'DESC' } });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const shipments = await this.shipRepo.find();
    const afters = await this.afterRepo.find();
    return list.map(o => ({
      ...o,
      productName: pmap.get(o.productId)?.name,
      shipment: shipments.find(s => s.orderId === o.id) || null,
      afterSale: afters.find(a => a.orderId === o.id) || null,
    }));
  }

  /** 直播下单：按锁定库存与温区校验，超出批次可供量时直接拒绝（超卖由销量预警提前暴露） */
  @Post('live-items/:id/orders')
  async placeOrder(@Param('id') id: string, @Body() dto: {
    customerName?: string; city: string; address: string; qty?: number;
  }) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    const b = await this.batchRepo.findOneOrFail({ where: { id: it.batchId } });
    const p = await this.productRepo.findOneOrFail({ where: { id: it.productId } });
    const qty = Math.max(1, Number(dto.qty) || 1);
    const sold = it.actualSoldQty;
    if (sold + qty > b.qty) {
      await this.risk.checkLiveItem({ ...it, actualSoldQty: sold + qty });
      throw new BadRequestException(`该批次可供 ${b.qty} 件，已下单 ${sold} 件，超卖拦截：请关闭下单入口或联系农户补货`);
    }
    if (p.coldChainRequirement !== '常温' && p.coldChainCities) {
      const cities = p.coldChainCities.split(/[,，]/).map(s => s.trim());
      if (dto.city && !cities.includes(dto.city)) {
        throw new BadRequestException(`该${p.coldChainRequirement}商品冷链暂不可达「${dto.city}」，仅支持：${cities.join('、')}`);
      }
    }
    it.actualSoldQty = sold + qty;
    if (it.status === 'locked' || it.status === 'planned') it.status = 'live';
    await this.liveItemRepo.save(it);
    b.qtySold += qty;
    await this.batchRepo.save(b);
    await this.risk.checkLiveItem(it);
    const order = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `SO${Date.now().toString().slice(-8)}${orderSeq++}`, liveItemId: it.id, batchId: b.id,
      productId: p.id, farmerId: p.farmerId, customerName: dto.customerName || '消费者',
      city: dto.city, address: dto.address, tempZoneRequired: p.coldChainRequirement,
      qty, amount: ((Number(it.price) - Number(it.coupon)) * qty).toFixed(2), status: 'paid',
    }));
    return order;
  }

  // ---------- 发货任务 ----------
  @Get('shipments')
  async shipments(@Query('status') status: string, @Query('warehouse') warehouse: string) {
    const where: any = {};
    if (status) where.status = status;
    if (warehouse) where.warehouse = warehouse;
    const list = await this.shipRepo.find({ where, order: { id: 'DESC' } });
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    return list.map(s => {
      const o = omap.get(s.orderId);
      return { ...s, order: o ? { ...o, productName: pmap.get(o.productId)?.name } : null };
    });
  }

  /** 按订单+批次+发货仓+物流温区+售后承诺生成发货任务 */
  @Post('shipments/generate')
  async generate(@Body() dto: { liveItemId?: number; warehouse?: string }) {
    const where: any = { status: 'paid' };
    if (dto.liveItemId) where.liveItemId = dto.liveItemId;
    const paidOrders = await this.orderRepo.find({ where });
    const created: Shipment[] = [];
    const existing = new Set((await this.shipRepo.find()).map(s => s.orderId));
    for (const o of paidOrders) {
      if (existing.has(o.id)) continue;
      const p = await this.productRepo.findOneOrFail({ where: { id: o.productId } });
      const carrier = o.tempZoneRequired === '常温' ? '中通快递' : (o.city === '上海' || o.city === '杭州' ? '顺丰冷链' : '京东冷链');
      const s = this.shipRepo.create({
        orderId: o.id, batchId: o.batchId, warehouse: dto.warehouse || '中心仓',
        carrier, tempZone: o.tempZoneRequired,
        promise: o.tempZoneRequired === '常温' ? '破损包赔，少发补发' : '坏果包赔，少发补发，冷链延误补偿优惠券',
        plannedShipAt: new Date(Date.now() + 6 * 3600 * 1000), status: 'pending',
      });
      created.push(await this.shipRepo.save(s));
    }
    return { created: created.length, shipments: created };
  }

  /** 冷链车未到：任务挂起等车 */
  @Post('shipments/:id/wait-cold')
  async waitCold(@Param('id') id: string, @Body() dto: { note?: string }) {
    const s = await this.shipRepo.findOneOrFail({ where: { id: Number(id) } });
    s.status = 'cold_wait';
    s.delayNote = dto.note || '等待冷链车到仓';
    return this.shipRepo.save(s);
  }

  @Post('shipments/:id/ship')
  async ship(@Param('id') id: string, @Body() dto: { carrier?: string; trackingNo?: string }) {
    const s = await this.shipRepo.findOneOrFail({ where: { id: Number(id) } });
    s.status = 'shipped';
    if (dto.carrier) s.carrier = dto.carrier;
    if (dto.trackingNo) s.trackingNo = dto.trackingNo;
    s.shippedAt = new Date();
    await this.shipRepo.save(s);
    const o = await this.orderRepo.findOneOrFail({ where: { id: s.orderId } });
    o.status = 'shipped';
    o.courier = s.carrier;
    o.trackingNo = s.trackingNo;
    await this.orderRepo.save(o);
    return s;
  }

  /** 冷链车晚到 / 物流延误：记录延误并升级预警 */
  @Post('shipments/:id/delay')
  async delay(@Param('id') id: string, @Body() dto: { minutes: number; note?: string }) {
    const s = await this.shipRepo.findOneOrFail({ where: { id: Number(id) } });
    s.status = 'delayed';
    s.delayNote = `延误${dto.minutes}分钟：${dto.note || ''}`;
    await this.shipRepo.save(s);
    const o = await this.orderRepo.findOneOrFail({ where: { id: s.orderId } });
    await this.risk.coldChainLate(s.batchId, dto.note || '物流中转延误', dto.minutes, o.farmerId);
    return s;
  }

  @Post('shipments/:id/deliver')
  async deliver(@Param('id') id: string) {
    const s = await this.shipRepo.findOneOrFail({ where: { id: Number(id) } });
    s.status = 'delivered';
    s.deliveredAt = new Date();
    await this.shipRepo.save(s);
    const o = await this.orderRepo.findOneOrFail({ where: { id: s.orderId } });
    o.status = 'delivered';
    await this.orderRepo.save(o);
    return s;
  }

  // ---------- 售后 ----------
  @Get('after-sales')
  async afterSales(@Query('status') status: string, @Query('farmerId') farmerId: string) {
    const where: any = {};
    if (status) where.status = status;
    if (farmerId) where.farmerId = Number(farmerId);
    const list = await this.afterRepo.find({ where, order: { id: 'DESC' } });
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const batches = await this.batchRepo.find();
    const bmap = new Map(batches.map(b => [b.id, b]));
    return list.map(a => ({
      ...a,
      orderNo: omap.get(a.orderId)?.orderNo,
      productName: pmap.get(a.productId)?.name,
      batchNo: bmap.get(a.batchId)?.batchNo,
    }));
  }

  /** 提交售后（坏果/少发/延误/地址错误/拒收/口味不符） */
  @Post('after-sales')
  async createAfterSale(@Body() dto: Partial<AfterSale>) {
    const order = await this.orderRepo.findOneOrFail({ where: { id: Number(dto.orderId) } });
    const a = this.afterRepo.create({
      orderId: order.id, batchId: order.batchId, productId: order.productId, farmerId: order.farmerId,
      reason: dto.reason!, description: dto.description || '', qty: dto.qty || 1,
      claimAmount: String(dto.claimAmount ?? order.amount), status: 'open',
      repurchaseHit: dto.repurchaseHit ?? true,
    });
    return this.afterRepo.save(a);
  }

  /**
   * 售后处置：退款/补发/折价/驳回；处置结果反向影响
   * 1) 批次坏果率统计 2) 农户稳定性 3) 下一场主播口径/预售量建议 4) 县域品牌风险说明建议
   */
  @Post('after-sales/:id/handle')
  async handle(@Param('id') id: string, @Body() dto: {
    resolution: 'refund' | 'resend' | 'discount' | 'reject';
    finalAmount: number; handleNote: string; repurchaseHit: boolean;
  }, @Req() req: any) {
    const a = await this.afterRepo.findOneOrFail({ where: { id: Number(id) } });
    a.resolution = dto.resolution;
    a.finalAmount = String(dto.finalAmount);
    a.handleNote = dto.handleNote || '';
    a.repurchaseHit = !!dto.repurchaseHit;
    a.status = 'handled';
    a.handledBy = req.user?.id;
    await this.afterRepo.save(a);

    const feedback: string[] = [];
    const b = await this.batchRepo.findOne({ where: { id: a.batchId } });
    const f = await this.farmerRepo.findOne({ where: { id: a.farmerId } });

    if (a.reason === 'bad_fruit' && b) {
      // 该批次坏果单数达阈值 → 按平滑口径估算坏果率（最小样本20单，避免小样本放大）
      const badCases = await this.afterRepo.count({ where: { batchId: b.id, reason: 'bad_fruit', status: 'handled' } });
      const ordersOfBatch = await this.orderRepo.count({ where: { batchId: b.id } }) || 1;
      const estRate = Math.max(Number(b.badRate), +(badCases / Math.max(ordersOfBatch, 20) * 100).toFixed(1));
      b.badRate = String(estRate);
      await this.batchRepo.save(b);
      await this.risk.checkBatch(b);
      feedback.push(`批次 ${b.batchNo} 坏果售后 ${badCases} 单，估算坏果率更新为 ${estRate}%`);
      if (f) {
        f.stabilityScore = String(Math.max(0, Math.round(Number(f.stabilityScore) - 2)));
        f.badRateAvg = ((Number(f.badRateAvg) * 0.7) + estRate * 0.3).toFixed(1);
        await this.farmerRepo.save(f);
        feedback.push(`农户「${f.name}」稳定性评分下调至 ${f.stabilityScore}，历史坏果率更新为 ${f.badRateAvg}%`);
      }
    }
    if (a.reason === 'short' && f) {
      f.stabilityScore = String(Math.max(0, Math.round(Number(f.stabilityScore) - 3)));
      f.onTimeRate = String(Math.max(0, Math.round(Number(f.onTimeRate) - 2)));
      await this.farmerRepo.save(f);
      feedback.push(`少发属实，农户「${f.name}」稳定性-3、准时率-2`);
    }
    if (a.reason === 'taste_mismatch') {
      feedback.push('建议下一场统一主播口感口径（避免“纯甜”等绝对化表述），并复核选品页承诺差距');
      await this.risk.promiseMismatch(a.batchId, a.farmerId, a.description || '消费者反馈口味与口播不符');
    }
    if (a.reason === 'delay') feedback.push('建议下一场对该温区/城市下调预售节奏，或加配备用冷链车');
    if (a.reason === 'rejected') feedback.push('用户拒收：核对地址与派送时效，生鲜件优先安排二次配送');
    if (a.reason === 'wrong_address') feedback.push('地址错误：建议下单后1小时内客服核对地址再出库');

    return { afterSale: a, feedback };
  }

  // ---------- 批次全链路追踪 ----------
  @Get('batches/:id/trace')
  async trace(@Param('id') id: string) {
    const b = await this.batchRepo.findOneOrFail({ where: { id: Number(id) } });
    const p = await this.productRepo.findOne({ where: { id: b.productId } });
    const f = p ? await this.farmerRepo.findOne({ where: { id: p.farmerId } }) : null;
    const selections = await this.manager_find(Selection, { batchId: b.id });
    const items = await this.liveItemRepo.find({ where: { batchId: b.id }, order: { id: 'ASC' } });
    const sessionIds = [...new Set(items.map(i => i.liveSessionId))];
    const sessions = await this.liveRepo.find({ where: sessionIds.length ? { id: In(sessionIds) } : {} });
    const itemIds = items.map(i => i.id);
    const locks = await this.lockRepo.find({ where: itemIds.length ? { liveItemId: In(itemIds) } : {} });
    const orders = await this.orderRepo.find({ where: { batchId: b.id }, order: { id: 'ASC' } });
    const shipments = await this.shipRepo.find({ where: { batchId: b.id }, order: { id: 'ASC' } });
    const afters = await this.afterRepo.find({ where: { batchId: b.id }, order: { id: 'ASC' } });
    const alerts = await this.manager_find(RiskAlert, { batchId: b.id });
    const settlements = await this.settleRepo.find({ where: { batchId: b.id } });

    const timeline: { at: Date; stage: string; text: string; tone: string }[] = [];
    timeline.push({ at: b.createdAt, stage: '批次申报', text: `批次 ${b.batchNo} 可供 ${b.qty} 件，温区 ${b.tempZone}`, tone: 'info' });
    for (const s of selections) timeline.push({ at: s.createdAt, stage: '选品质检', text: `运营选品结论：${s.status === 'selected' ? `履约分 ${s.fulfillScore}，${s.decisionNote}` : '退回：' + s.decisionNote}`, tone: Number(s.fulfillScore) >= 80 ? 'ok' : 'warn' });
    for (const ls of sessions) timeline.push({ at: ls.scheduledStart || ls.createdAt, stage: '直播排期', text: `《${ls.title}》主播 ${ls.anchorName}（${ls.status}）`, tone: 'info' });
    for (const it of items) timeline.push({ at: it.createdAt, stage: '直播销售', text: `排品价 ¥${it.price}（券¥${it.coupon}），预估 ${it.estimatedSales} / 预售 ${it.presaleQty} / 实售 ${it.actualSoldQty}，口径：${it.anchorPromise}`, tone: it.actualSoldQty > it.estimatedSales ? 'warn' : 'info' });
    for (const l of locks) timeline.push({ at: l.createdAt, stage: '库存锁定', text: `${l.warehouse} 锁定 ${l.qtyLocked} 件，包装：${l.packagingMaterial} ×${l.packagingQty}（${l.status}）`, tone: 'info' });
    for (const o of orders) timeline.push({ at: o.createdAt, stage: '下单', text: `${o.orderNo} ${o.city} ×${o.qty}（${o.status}）`, tone: 'info' });
    for (const sp of shipments) timeline.push({
      at: sp.shippedAt || sp.createdAt, stage: '发货',
      text: `${sp.warehouse} → ${sp.carrier} ${sp.trackingNo || ''} [${sp.tempZone}] ${sp.status}${sp.delayNote ? '：' + sp.delayNote : ''}｜承诺：${sp.promise}`,
      tone: sp.status === 'delayed' || sp.status === 'cold_wait' ? 'danger' : 'ok',
    });
    for (const a of afters) timeline.push({ at: a.createdAt, stage: '售后', text: `${reasonText(a.reason)}：${a.description} → ${a.resolution || '待处理'} ¥${a.finalAmount || a.claimAmount}`, tone: 'danger' });
    for (const al of alerts) timeline.push({ at: al.createdAt, stage: '风险预警', text: `[${al.severity}] ${al.message}（${al.status}）`, tone: al.severity === 'high' ? 'danger' : 'warn' });
    for (const st of settlements) timeline.push({ at: st.createdAt, stage: '农户结算', text: `货款 ¥${st.grossAmount} − 售后 ¥${st.afterSaleDeduction} − 违约金 ¥${st.penalty} = 应付 ¥${st.netAmount}（${st.status}）`, tone: 'ok' });
    timeline.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

    return { batch: b, product: p, farmer: f, timeline, ordersCount: orders.length, afterSalesCount: afters.length };
  }

  private manager_find(cls: any, where: any): Promise<any[]> {
    return this.orderRepo.manager.find(cls, { where });
  }
}

function reasonText(r: string): string {
  return ({
    bad_fruit: '坏果', short: '少发', delay: '物流延误',
    wrong_address: '地址错误', rejected: '用户拒收', taste_mismatch: '口味不符',
  } as Record<string, string>)[r] || r;
}

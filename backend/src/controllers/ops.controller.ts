import {
  Body, Controller, Get, Param, Post, Query, Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtGuard } from '../jwt.guard';
import {
  Product, Farmer, Batch, Selection, LiveSession, LiveItem, InventoryLock,
  Order, Settlement, RiskAlert, BrandNotice, AfterSale,
} from '../entities';
import { RiskService } from '../risk.service';

@UseGuards(JwtGuard)
@Controller()
export class OpsController {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(Selection) private selectionRepo: Repository<Selection>,
    @InjectRepository(LiveSession) private liveRepo: Repository<LiveSession>,
    @InjectRepository(LiveItem) private liveItemRepo: Repository<LiveItem>,
    @InjectRepository(InventoryLock) private lockRepo: Repository<InventoryLock>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Settlement) private settleRepo: Repository<Settlement>,
    @InjectRepository(RiskAlert) private alertRepo: Repository<RiskAlert>,
    @InjectRepository(BrandNotice) private noticeRepo: Repository<BrandNotice>,
    @InjectRepository(AfterSale) private afterRepo: Repository<AfterSale>,
    private risk: RiskService,
  ) {}

  // ---------- 选品 ----------
  @Get('selections')
  async selections() {
    const list = await this.selectionRepo.find({ order: { id: 'DESC' } });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const farmers = await this.farmerRepo.find();
    const fmap = new Map(farmers.map(f => [f.id, f]));
    return list.map(s => ({
      ...s,
      product: pmap.get(s.productId) || null,
      farmer: pmap.get(s.productId) ? fmap.get(pmap.get(s.productId)!.farmerId) || null : null,
    }));
  }

  /** 运营选品决策：按履约评估结果选中 / 退回，并留存分项与差距说明 */
  @Post('products/:id/select')
  async select(@Param('id') id: string, @Body() dto: { status: 'selected' | 'rejected'; decisionNote?: string }) {
    const p = await this.productRepo.findOneOrFail({ where: { id: Number(id) } });
    const f = await this.farmerRepo.findOneOrFail({ where: { id: p.farmerId } });
    const b = (await this.batchRepo.find({ where: { productId: p.id }, order: { id: 'DESC' } }))[0];
    if (dto.status === 'selected' && !b) throw new BadRequestException('该商品还没有可供直播批次');
    const ev = this.risk.evaluate(p, f, b);
    const s = this.selectionRepo.create({
      productId: p.id, batchId: b.id,
      fulfillScore: String(ev.score),
      scoreDetail: JSON.stringify(ev.parts),
      gaps: JSON.stringify(ev.gaps),
      decisionNote: dto.decisionNote || ev.suggestions.join('；'),
      status: dto.status,
    });
    const saved = await this.selectionRepo.save(s);
    p.status = dto.status === 'selected' ? 'selected' : 'rejected';
    await this.productRepo.save(p);
    // 选品即触发一次批次风险检查（报告过期等会在此暴露）
    await this.risk.checkBatch(b);
    return saved;
  }

  // ---------- 直播场次 ----------
  @Get('live-sessions')
  async liveSessions() {
    const sessions = await this.liveRepo.find({ order: { scheduledStart: 'ASC' } });
    const items = await this.liveItemRepo.find({ order: { id: 'ASC' } });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const batches = await this.batchRepo.find();
    const bmap = new Map(batches.map(b => [b.id, b]));
    const locks = await this.lockRepo.find();
    return sessions.map(ls => ({
      ...ls,
      items: items.filter(i => i.liveSessionId === ls.id).map(i => {
        const b = bmap.get(i.batchId);
        return {
          ...i,
          product: pmap.get(i.productId) || null,
          batch: b || null,
          lock: locks.find(l => l.liveItemId === i.id && l.status !== 'released') || null,
          availableQty: b ? b.qty - b.qtyLocked : 0,
        };
      }),
    }));
  }

  @Post('live-sessions')
  createSession(@Body() dto: Partial<LiveSession>) {
    return this.liveRepo.save(this.liveRepo.create({ ...dto, status: 'planned' }));
  }

  /** 安排排品：主播口径、价格、优惠券、预计销量；系统按稳定性/坏果率给建议预售量 */
  @Post('live-sessions/:id/items')
  async addItem(@Param('id') id: string, @Body() dto: {
    productId: number; price: number; coupon?: number; estimatedSales: number; anchorPromise: string;
  }) {
    const sel = (await this.selectionRepo.find({ where: { productId: dto.productId, status: 'selected' }, order: { id: 'DESC' } }))[0];
    if (!sel) throw new BadRequestException('商品尚未通过选品，不能排进直播');
    const b = await this.batchRepo.findOneOrFail({ where: { id: sel.batchId } });
    const p = await this.productRepo.findOneOrFail({ where: { id: dto.productId } });
    const f = await this.farmerRepo.findOneOrFail({ where: { id: p.farmerId } });
    const suggested = this.risk.suggestPresale({
      availableQty: b.qty - b.qtyLocked, stability: Number(f.stabilityScore), badRate: Number(b.badRate),
    } as any);
    const item = await this.liveItemRepo.save(this.liveItemRepo.create({
      liveSessionId: Number(id), selectionId: sel.id, batchId: b.id, productId: dto.productId,
      price: String(dto.price), coupon: String(dto.coupon ?? 0),
      estimatedSales: dto.estimatedSales,
      presaleQty: Math.min(dto.estimatedSales, b.qty - b.qtyLocked, suggested),
      anchorPromise: dto.anchorPromise, status: 'planned',
    }));
    return { item, suggestedPresale: suggested };
  }

  @Post('live-items/:id/promise')
  async updatePromise(@Param('id') id: string, @Body() dto: { anchorPromise: string }) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    it.anchorPromise = dto.anchorPromise;
    return this.liveItemRepo.save(it);
  }

  // ---------- 仓库：按排期锁定库存与包装材料 ----------
  @Post('live-items/:id/lock')
  async lockInventory(@Param('id') id: string, @Body() dto: { qtyLocked?: number; warehouse?: string; packagingMaterial?: string }) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    const b = await this.batchRepo.findOneOrFail({ where: { id: it.batchId } });
    const qty = Math.min(dto.qtyLocked ?? it.presaleQty, b.qty - b.qtyLocked);
    if (qty <= 0) throw new BadRequestException('批次可供库存不足，无法锁定');
    b.qtyLocked += qty;
    b.status = b.qtyLocked >= b.qty ? 'locked' : b.status === 'short' ? 'short' : 'locked';
    await this.batchRepo.save(b);
    const lock = await this.lockRepo.save(this.lockRepo.create({
      liveItemId: it.id, batchId: b.id, warehouse: dto.warehouse || '中心仓',
      qtyLocked: qty, packagingMaterial: dto.packagingMaterial || '泡沫箱+冰袋+缓冲隔板',
      packagingQty: qty, status: 'locked',
    }));
    it.status = 'locked';
    await this.liveItemRepo.save(it);
    return lock;
  }

  @Post('live-items/:id/release-lock')
  async releaseLock(@Param('id') id: string) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    const locks = await this.lockRepo.find({ where: { liveItemId: it.id, status: 'locked' } });
    for (const l of locks) {
      const b = await this.batchRepo.findOneOrFail({ where: { id: l.batchId } });
      b.qtyLocked = Math.max(0, b.qtyLocked - l.qtyLocked);
      await this.batchRepo.save(b);
      l.status = 'released';
      await this.lockRepo.save(l);
    }
    it.status = 'planned';
    return this.liveItemRepo.save(it);
  }

  // ---------- 直播中 / 截单 ----------
  @Post('live-sessions/:id/go-live')
  async goLive(@Param('id') id: string) {
    const ls = await this.liveRepo.findOneOrFail({ where: { id: Number(id) } });
    ls.status = 'live';
    await this.liveRepo.save(ls);
    for (const it of await this.liveItemRepo.find({ where: { liveSessionId: ls.id } })) {
      if (it.status === 'locked') it.status = 'live';
      await this.liveItemRepo.save(it);
    }
    return ls;
  }

  /** 录入实时销量；超过预估或供给时触发预警 */
  @Post('live-items/:id/sales')
  async reportSales(@Param('id') id: string, @Body() dto: { actualSoldQty: number }) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    it.actualSoldQty = dto.actualSoldQty;
    if (it.status === 'planned' || it.status === 'locked') it.status = 'live';
    await this.liveItemRepo.save(it);
    await this.risk.checkLiveItem(it);
    return it;
  }

  @Post('live-sessions/:id/finish')
  async finish(@Param('id') id: string) {
    const ls = await this.liveRepo.findOneOrFail({ where: { id: Number(id) } });
    ls.status = 'finished';
    await this.liveRepo.save(ls);
    for (const it of await this.liveItemRepo.find({ where: { liveSessionId: ls.id, status: In(['live','planned','locked']) } })) {
      it.status = 'ended';
      await this.liveItemRepo.save(it);
    }
    return ls;
  }

  // ---------- 风险预警 ----------
  @Get('risk-alerts')
  async alerts(@Query('status') status: string) {
    const where: any = {};
    if (status) where.status = status;
    const list = await this.alertRepo.find({ where, order: { id: 'DESC' } });
    const batches = await this.batchRepo.find();
    const bmap = new Map(batches.map(b => [b.id, b]));
    const farmers = await this.farmerRepo.find();
    const fmap = new Map(farmers.map(f => [f.id, f]));
    return list.map(a => ({
      ...a,
      batchNo: a.batchId ? bmap.get(a.batchId)?.batchNo : null,
      farmerName: a.farmerId ? fmap.get(a.farmerId)?.name : null,
    }));
  }

  @Post('risk-alerts/:id/handle')
  async handleAlert(@Param('id') id: string, @Body() dto: { handleNote: string; status?: string }) {
    const a = await this.alertRepo.findOneOrFail({ where: { id: Number(id) } });
    a.status = dto.status || 'handled';
    a.handleNote = dto.handleNote || '';
    return this.alertRepo.save(a);
  }

  @Post('risk-alerts/cold-chain-late')
  coldLate(@Body() dto: { batchId: number; minutes: number; note?: string; farmerId?: number }) {
    return this.risk.coldChainLate(dto.batchId, dto.note || '', dto.minutes, dto.farmerId);
  }

  @Post('risk-alerts/promise-mismatch')
  promiseMismatch(@Body() dto: { batchId: number; farmerId: number; detail: string }) {
    return this.risk.promiseMismatch(dto.batchId, dto.farmerId, dto.detail);
  }

  // ---------- 县域公共品牌风险说明 ----------
  @Get('brand-notices')
  notices() { return this.noticeRepo.find({ order: { id: 'DESC' } }); }

  @Post('brand-notices')
  createNotice(@Body() dto: Partial<BrandNotice>) {
    return this.noticeRepo.save(this.noticeRepo.create({ ...dto, status: 'draft' }));
  }

  @Post('brand-notices/:id/publish')
  async publishNotice(@Param('id') id: string) {
    const n = await this.noticeRepo.findOneOrFail({ where: { id: Number(id) } });
    n.status = 'published';
    n.publishedAt = new Date();
    return this.noticeRepo.save(n);
  }

  // ---------- 农户结算 ----------
  @Get('settlements')
  async settlements(@Query('farmerId') farmerId: string) {
    const where: any = {};
    if (farmerId) where.farmerId = Number(farmerId);
    const list = await this.settleRepo.find({ where, order: { id: 'DESC' } });
    const farmers = await this.farmerRepo.find();
    const fmap = new Map(farmers.map(f => [f.id, f]));
    const batches = await this.batchRepo.find();
    const bmap = new Map(batches.map(b => [b.id, b]));
    return list.map(s => ({ ...s, farmerName: fmap.get(s.farmerId)?.name, batchNo: bmap.get(s.batchId)?.batchNo }));
  }

  /** 按已结束排品生成结算单：货款 - 售后实退 - 品质违约金（坏果率超标） */
  @Post('live-items/:id/settle')
  async settle(@Param('id') id: string) {
    const it = await this.liveItemRepo.findOneOrFail({ where: { id: Number(id) } });
    if (it.status !== 'ended') throw new BadRequestException('该排品尚未截单，不能结算');
    const exist = await this.settleRepo.findOne({ where: { liveItemId: it.id } });
    if (exist) return exist;
    const p = await this.productRepo.findOneOrFail({ where: { id: it.productId } });
    const orders = await this.orderRepo.find({ where: { liveItemId: it.id } });
    const qtySold = orders.reduce((s, o) => s + o.qty, 0) || it.actualSoldQty;
    const netPrice = Number(it.price) - Number(it.coupon);
    const gross = qtySold * netPrice;
    const afters = await this.afterRepo.find({ where: { batchId: it.batchId } });
    const deduction = afters.filter(a => a.status === 'handled').reduce((s, a) => s + Number(a.finalAmount), 0);
    const b = await this.batchRepo.findOneOrFail({ where: { id: it.batchId } });
    const bad = Number(b.badRate);
    const penalty = bad >= 8 ? +(gross * 0.02).toFixed(2) : 0;
    const note = penalty > 0
      ? `批次坏果率${bad}%超过8%红线，按销售额2%计品质违约金；售后实退${deduction.toFixed(2)}元另扣`
      : `售后实退/补偿合计${deduction.toFixed(2)}元`;
    return this.settleRepo.save(this.settleRepo.create({
      farmerId: p.farmerId, liveItemId: it.id, batchId: it.batchId, qtySold,
      grossAmount: gross.toFixed(2), afterSaleDeduction: deduction.toFixed(2),
      penalty: penalty.toFixed(2), netAmount: (gross - deduction - penalty).toFixed(2),
      status: 'pending', note,
    }));
  }

  @Post('settlements/:id/confirm')
  async confirmSettle(@Param('id') id: string) {
    const s = await this.settleRepo.findOneOrFail({ where: { id: Number(id) } });
    s.status = 'settled';
    return this.settleRepo.save(s);
  }
}

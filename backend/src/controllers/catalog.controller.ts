import {
  Body, Controller, Get, Param, Post, Query, Req, UseGuards, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtGuard } from '../jwt.guard';
import { Product, Farmer, Batch, Selection, LiveItem } from '../entities';
import { RiskService } from '../risk.service';

@UseGuards(JwtGuard)
@Controller()
export class CatalogController {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(Selection) private selectionRepo: Repository<Selection>,
    @InjectRepository(LiveItem) private liveItemRepo: Repository<LiveItem>,
    private risk: RiskService,
  ) {}

  @Get('farmers')
  farmers() { return this.farmerRepo.find({ order: { id: 'ASC' } }); }

  @Get('products')
  async products(@Query('status') status: string, @Query('farmerId') farmerId: string, @Req() req: any) {
    const where: any = {};
    if (status) where.status = status;
    if (req.user.role === 'farmer') where.farmerId = req.user.farmerId;
    else if (farmerId) where.farmerId = Number(farmerId);
    const list = await this.productRepo.find({ where, order: { id: 'DESC' } });
    const farmers = await this.farmerRepo.find();
    const fmap = new Map(farmers.map(f => [f.id, f]));
    const batches = await this.batchRepo.find({ where: { productId: In(list.map(p => p.id)) } });
    const selections = await this.selectionRepo.find({ order: { id: 'DESC' } });
    return list.map(p => ({
      ...p,
      farmer: fmap.get(p.farmerId) || null,
      batches: batches.filter(b => b.productId === p.id),
      selection: selections.find(s => s.productId === p.id) || null,
    }));
  }

  @Get('products/:id')
  async product(@Param('id') id: string) {
    const p = await this.productRepo.findOne({ where: { id: Number(id) } });
    if (!p) throw new NotFoundException('商品不存在');
    const farmer = await this.farmerRepo.findOne({ where: { id: p.farmerId } });
    const batches = await this.batchRepo.find({ where: { productId: p.id }, order: { id: 'DESC' } });
    const selection = await this.selectionRepo.findOne({ where: { productId: p.id }, order: { id: 'DESC' } });
    return { ...p, farmer, batches, selection };
  }

  /** 农户/合作社提交商品申报 */
  @Post('products')
  async createProduct(@Body() dto: Partial<Product>, @Req() req: any) {
    const farmerId = req.user.role === 'farmer' ? req.user.farmerId : dto.farmerId;
    if (!farmerId) throw new ForbiddenException('缺少所属农户档案');
    const p = this.productRepo.create({
      ...dto, farmerId: Number(farmerId), status: 'submitted',
      tastingScore: dto.tastingScore ?? '0', packagingPressure: dto.packagingPressure ?? 3,
    });
    return this.productRepo.save(p);
  }

  /** 补录/更新检测报告（复检） */
  @Post('products/:id/report')
  async updateReport(@Param('id') id: string, @Body() dto: { testReportNo: string; testReportDate: string; testReportExpiry: string }) {
    const p = await this.productRepo.findOneOrFail({ where: { id: Number(id) } });
    Object.assign(p, dto);
    await this.productRepo.save(p);
    const batches = await this.batchRepo.find({ where: { productId: p.id, status: In(['available', 'locked', 'short']) } });
    for (const b of batches) {
      b.testReportExpiry = dto.testReportExpiry;
      await this.batchRepo.save(b);
      await this.risk.checkBatch(b);
    }
    return p;
  }

  /** 样品试吃记录 */
  @Post('products/:id/tasting')
  async tasting(@Param('id') id: string, @Body() dto: { tastingScore: number; tastingNote: string }) {
    const p = await this.productRepo.findOneOrFail({ where: { id: Number(id) } });
    p.tastingScore = String(dto.tastingScore);
    p.tastingNote = dto.tastingNote || '';
    return this.productRepo.save(p);
  }

  /** 上架前：商品承诺 vs 真实履约能力评估 */
  @Get('products/:id/evaluation')
  async evaluation(@Param('id') id: string, @Query('batchId') batchId: string) {
    const p = await this.productRepo.findOneOrFail({ where: { id: Number(id) } });
    const f = await this.farmerRepo.findOneOrFail({ where: { id: p.farmerId } });
    const b = batchId ? await this.batchRepo.findOne({ where: { id: Number(batchId) } }) :
      (await this.batchRepo.find({ where: { productId: p.id }, order: { id: 'DESC' } }))[0];
    const ev = this.risk.evaluate(p, f, b || undefined);
    return { ...ev, suggestedPresale: b ? this.risk.suggestPresale({
      availableQty: b.qty - b.qtyLocked, stability: Number(f.stabilityScore), badRate: Number(b.badRate),
    } as any) : null };
  }

  @Get('batches')
  batches(@Query('productId') productId: string, @Query('status') status: string) {
    const where: any = {};
    if (productId) where.productId = Number(productId);
    if (status) where.status = status;
    return this.batchRepo.find({ where, order: { id: 'DESC' } });
  }

  /** 登记可供直播批次 */
  @Post('batches')
  async createBatch(@Body() dto: Partial<Batch>, @Req() req: any) {
    if (req.user.role === 'farmer') {
      const p = await this.productRepo.findOneOrFail({ where: { id: Number(dto.productId) } });
      if (p.farmerId !== req.user.farmerId) throw new ForbiddenException('不能为他人商品登记批次');
    }
    const b = this.batchRepo.create({ ...dto, productId: Number(dto.productId), qty: Number(dto.qty), status: 'available' });
    const saved = await this.batchRepo.save(b);
    await this.risk.checkBatch(saved);
    return saved;
  }

  /** 批次事件：临时少供 / 更新坏果率（会触发预警） */
  @Post('batches/:id/event')
  async batchEvent(@Param('id') id: string, @Body() dto: { status?: string; badRate?: number; qty?: number }) {
    const b = await this.batchRepo.findOneOrFail({ where: { id: Number(id) } });
    if (dto.status) b.status = dto.status as any;
    if (dto.badRate !== undefined) b.badRate = String(dto.badRate);
    if (dto.qty !== undefined) b.qty = dto.qty;
    await this.batchRepo.save(b);
    await this.risk.checkBatch(b);
    const items = await this.liveItemRepo.find({ where: { batchId: b.id } });
    for (const it of items) await this.risk.checkLiveItem(it);
    return b;
  }
}

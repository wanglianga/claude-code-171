import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { Livestream } from '../../entities/livestream.entity';
import { Batch } from '../../entities/batch.entity';
import { Selection } from '../../entities/selection.entity';
import { InventoryLock } from '../../entities/inventory-lock.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { RisksService } from '../risks/risks.module';
import { reachableCities } from '../products/products.module';

class LivestreamDto {
  @IsNotEmpty() title: string;
  @IsInt() batchId: number;
  @IsNotEmpty() anchorName: string;
  @IsOptional() scriptSummary?: string;
  @IsOptional() promiseText?: string;
  @IsNotEmpty() price: number;
  @IsOptional() couponAmount?: number;
  @IsInt() @Min(1) estimatedSales: number;
  @IsNotEmpty() scheduledAt: string;
  @IsOptional() sampleTasteDone?: boolean;
}

@Injectable()
export class LivestreamsService {
  constructor(
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Selection) private selections: Repository<Selection>,
    @InjectRepository(InventoryLock) private locks: Repository<InventoryLock>,
    private risks: RisksService,
  ) {}

  async create(dto: LivestreamDto, user: any) {
    const batch = await this.batches.findOne({ where: { id: dto.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    if (!['qc_passed'].includes(batch.status)) {
      throw new BadRequestException(`批次当前状态为 ${batch.status}，须质检通过后方可排播`);
    }
    if (!batch.livestreamAvailable) {
      throw new BadRequestException('该批次未开放直播供货');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (batch.testReportExpiry && batch.testReportExpiry < today) {
      await this.risks.emit(
        'report_expired',
        'critical',
        `批次 ${batch.batchNo} 检测报告已过期仍尝试排播「${dto.title}」，已拦截`,
        batch.id,
      );
      throw new BadRequestException('检测报告已过期，禁止排播');
    }
    if (dto.estimatedSales > batch.availableQty) {
      await this.risks.emit(
        'oversell',
        'warning',
        `直播「${dto.title}」预估销量 ${dto.estimatedSales} 超过批次 ${batch.batchNo} 可售库存 ${batch.availableQty}`,
        batch.id,
      );
    }
    const ls = this.livestreams.create({
      ...dto,
      price: dto.price as any,
      couponAmount: (dto.couponAmount || 0) as any,
      scheduledAt: new Date(dto.scheduledAt),
      status: 'planned',
      createdBy: user.sub,
      sampleTasteDone: !!dto.sampleTasteDone,
    });
    return this.livestreams.save(ls);
  }

  async list(query: any) {
    const qb = this.livestreams
      .createQueryBuilder('l')
      .leftJoinAndMapOne('l.batch', Batch, 'b', 'b.id = l.batch_id')
      .leftJoinAndSelect('b.product', 'p')
      .leftJoinAndSelect('p.farmer', 'f')
      .orderBy('l.id', 'DESC');
    if (query.status) qb.andWhere('l.status = :st', { st: query.status });
    if (query.batchId) qb.andWhere('l.batch_id = :bid', { bid: +query.batchId });
    return qb.getMany();
  }

  async get(id: number) {
    const ls = await this.livestreams
      .createQueryBuilder('l')
      .leftJoinAndMapOne('l.batch', Batch, 'b', 'b.id = l.batch_id')
      .leftJoinAndSelect('b.product', 'p')
      .leftJoinAndSelect('p.farmer', 'f')
      .where('l.id = :id', { id })
      .getOne();
    if (!ls) throw new NotFoundException('直播场次不存在');
    return ls;
  }

  /**
   * 上架前检查：商品承诺 vs 真实履约能力
   * 输出逐项对照（样品口感/检测报告/采摘窗口/保质期/包装耐压/冷链可达/农户稳定性/库存）
   */
  async precheck(batchId: number, scheduledAt?: string) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const product = batch.product;
    const farmer = product.farmer;
    const at = scheduledAt ? new Date(scheduledAt) : new Date();
    const atStr = at.toISOString().slice(0, 10);
    const items: any[] = [];

    // 1. 样品试吃
    const sel = await this.selections.findOne({
      where: { batchId, decision: 'selected' },
      order: { id: 'DESC' },
    });
    items.push({
      key: 'taste',
      label: '样品口感',
      status: !sel ? 'bad' : sel.sampleTasteScore >= 7 ? 'ok' : sel.sampleTasteScore >= 5 ? 'warn' : 'bad',
      detail: sel
        ? `试吃评分 ${sel.sampleTasteScore}/10${sel.sampleNotes ? '：' + sel.sampleNotes : ''}`
        : '尚无样品试吃记录',
    });

    // 2. 检测报告
    if (!batch.testReportNo) {
      items.push({ key: 'report', label: '检测报告', status: 'bad', detail: '未上传检测报告' });
    } else if (batch.testReportExpiry && batch.testReportExpiry < atStr) {
      items.push({
        key: 'report', label: '检测报告', status: 'bad',
        detail: `报告 ${batch.testReportNo} 已于 ${batch.testReportExpiry} 过期`,
      });
    } else {
      const days = Math.ceil((new Date(batch.testReportExpiry).getTime() - at.getTime()) / 86400000);
      items.push({
        key: 'report', label: '检测报告',
        status: days <= 7 ? 'warn' : 'ok',
        detail: `报告 ${batch.testReportNo} 有效期至 ${batch.testReportExpiry}（剩余 ${days} 天）`,
      });
    }

    // 3. 采摘窗口
    if (atStr <= batch.harvestWindowEnd) {
      const days = Math.ceil((new Date(batch.harvestWindowEnd).getTime() - at.getTime()) / 86400000);
      items.push({
        key: 'window', label: '采摘窗口',
        status: days <= 2 ? 'warn' : 'ok',
        detail: `采摘于 ${batch.harvestDate}，窗口至 ${batch.harvestWindowEnd}（剩余 ${days} 天）`,
      });
    } else {
      items.push({
        key: 'window', label: '采摘窗口', status: 'bad',
        detail: `已过采摘窗口（${batch.harvestWindowEnd} 截止），鲜度无法保证`,
      });
    }

    // 4. 保质期覆盖（直播日 + 7 天物流售后期）
    const shelfEnd = new Date(new Date(batch.harvestDate).getTime() + product.shelfLifeDays * 86400000);
    const needEnd = new Date(at.getTime() + 7 * 86400000);
    items.push({
      key: 'shelf', label: '保质期覆盖',
      status: shelfEnd >= needEnd ? 'ok' : 'warn',
      detail: `保质期 ${product.shelfLifeDays} 天（至 ${shelfEnd.toISOString().slice(0, 10)}），需覆盖直播后 7 天物流期`,
    });

    // 5. 包装耐压
    const fragile = product.category === '水果' || product.category === '菌菇';
    items.push({
      key: 'packaging', label: '包装耐压',
      status: !fragile ? 'ok' : product.pressureResistance === '高' ? 'ok' : product.pressureResistance === '中' ? 'warn' : 'bad',
      detail: `${product.packagingType}，耐压等级「${product.pressureResistance}」${fragile ? '，易损品类建议高耐压' : ''}`,
    });

    // 6. 冷链可达城市
    const cities = reachableCities(product.tempZone);
    items.push({
      key: 'coldchain', label: '冷链可达',
      status: !product.coldChainRequired ? 'ok' : cities.length >= 8 ? 'ok' : 'warn',
      detail: product.coldChainRequired
        ? `需${product.tempZone}配送，可达 ${cities.length} 城：${cities.slice(0, 6).join('、')}${cities.length > 6 ? ' 等' : ''}`
        : `常温配送，全国 ${cities.length} 城可达`,
    });

    // 7. 农户交货稳定性
    items.push({
      key: 'farmer', label: '农户稳定性',
      status: farmer.stabilityScore >= 0.85 ? 'ok' : farmer.stabilityScore >= 0.7 ? 'warn' : 'bad',
      detail: `${farmer.name}：稳定性 ${(farmer.stabilityScore * 100).toFixed(0)}%，履约 ${farmer.fulfilledBatches}/${farmer.totalBatches} 批次，历史坏果率 ${(farmer.avgDefectRate * 100).toFixed(1)}%，售后率 ${(farmer.aftersalesRate * 100).toFixed(1)}%`,
    });

    // 8. 可供库存
    items.push({
      key: 'stock', label: '可供库存',
      status: batch.availableQty > 0 ? 'ok' : 'bad',
      detail: `批次供货 ${batch.quantity} 件，当前可售 ${batch.availableQty} 件`,
    });

    const badCount = items.filter((i) => i.status === 'bad').length;
    const warnCount = items.filter((i) => i.status === 'warn').length;
    const suggestedMaxSales = Math.max(
      0,
      Math.floor(batch.availableQty * (0.6 + 0.4 * farmer.stabilityScore)),
    );
    return {
      batch: { ...batch, reachableCities: cities },
      items,
      summary: {
        level: badCount > 0 ? 'bad' : warnCount > 0 ? 'warn' : 'ok',
        badCount,
        warnCount,
        suggestedMaxSales,
        advice:
          badCount > 0
            ? '存在履约硬约束，建议暂缓上架或更换批次'
            : warnCount > 0
              ? '存在履约风险点，建议压缩预售量并在脚本中保守承诺'
              : '履约能力良好，可按计划上架',
      },
    };
  }

  async start(id: number) {
    const ls = await this.get(id);
    if (!['planned', 'locked'].includes(ls.status)) {
      throw new BadRequestException('仅排期或已锁库的场次可开播');
    }
    ls.status = 'live';
    await this.livestreams.save(ls);
    await this.batches.update(ls.batchId, { status: 'on_sale' });
    return ls;
  }

  async end(id: number) {
    const ls = await this.get(id);
    if (ls.status !== 'live') throw new BadRequestException('仅直播中的场次可结束');
    ls.status = 'ended';
    await this.livestreams.save(ls);
    const batch = await this.batches.findOne({ where: { id: ls.batchId } });
    if (ls.actualSales > ls.estimatedSales) {
      await this.risks.emit(
        'oversell',
        'warning',
        `直播「${ls.title}」实际销量 ${ls.actualSales} 超过预估 ${ls.estimatedSales}（超出 ${ls.actualSales - ls.estimatedSales} 件）`,
        ls.batchId,
        ls.id,
      );
    }
    // 锁库记录转为已消耗
    await this.locks.update({ livestreamId: ls.id, status: 'locked' }, { status: 'consumed' });
    // 批次收官或回到可排播状态
    const next = batch.availableQty <= 0 ? 'closed' : 'qc_passed';
    await this.batches.update(batch.id, { status: next });
    return ls;
  }

  async cancel(id: number) {
    const ls = await this.get(id);
    if (['ended', 'cancelled'].includes(ls.status)) {
      throw new BadRequestException('场次已结束');
    }
    ls.status = 'cancelled';
    await this.livestreams.save(ls);
    await this.locks.update({ livestreamId: ls.id, status: 'locked' }, { status: 'released' });
    return ls;
  }

  /** 上报主播承诺与实际规格不一致 */
  async reportPromiseMismatch(id: number, detail: string) {
    const ls = await this.get(id);
    await this.risks.emit(
      'promise_mismatch',
      'critical',
      `直播「${ls.title}」主播承诺与实际规格不一致：${detail}（承诺口径：${ls.promiseText || '未填写'}）`,
      ls.batchId,
      ls.id,
    );
    return { ok: true };
  }
}

@Controller('livestreams')
export class LivestreamsController {
  constructor(private svc: LivestreamsService) {}

  @Post()
  @Roles('operator')
  create(@Body() dto: LivestreamDto, @ReqUser() user: any) {
    return this.svc.create(dto, user);
  }

  @Get()
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get('precheck/:batchId')
  @Roles('operator')
  precheck(@Param('batchId') batchId: string, @Query('scheduledAt') scheduledAt?: string) {
    return this.svc.precheck(+batchId, scheduledAt);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(+id);
  }

  @Post(':id/start')
  @Roles('operator')
  start(@Param('id') id: string) {
    return this.svc.start(+id);
  }

  @Post(':id/end')
  @Roles('operator')
  end(@Param('id') id: string) {
    return this.svc.end(+id);
  }

  @Post(':id/cancel')
  @Roles('operator')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(+id);
  }

  @Post(':id/promise-mismatch')
  @Roles('operator', 'aftersales')
  mismatch(@Param('id') id: string, @Body() body: { detail: string }) {
    return this.svc.reportPromiseMismatch(+id, body.detail || '规格不符');
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Livestream, Batch, Selection, InventoryLock])],
  controllers: [LivestreamsController],
  providers: [LivestreamsService],
  exports: [LivestreamsService],
})
export class LivestreamsModule {}

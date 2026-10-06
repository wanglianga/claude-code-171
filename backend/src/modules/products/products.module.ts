import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { Product } from '../../entities/product.entity';
import { Batch } from '../../entities/batch.entity';
import { Farmer } from '../../entities/farmer.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { RisksService } from '../risks/risks.module';
import { FarmersService } from '../farmers/farmers.module';

/** 冷链可达城市测算（按温区模拟县域冷链干线覆盖） */
export function reachableCities(tempZone: string): string[] {
  if (tempZone === '冷冻') {
    return ['杭州市', '上海市', '南京市', '合肥市'];
  }
  if (tempZone === '冷藏') {
    return [
      '杭州市', '上海市', '南京市', '合肥市', '苏州市', '宁波市',
      '武汉市', '长沙市', '南昌市', '福州市',
    ];
  }
  return [
    '杭州市', '上海市', '南京市', '合肥市', '苏州市', '宁波市', '武汉市',
    '长沙市', '南昌市', '福州市', '北京市', '广州市', '深圳市', '成都市', '郑州市',
  ];
}

class ProductDto {
  @IsNotEmpty() name: string;
  @IsNotEmpty() category: string;
  @IsNotEmpty() origin: string;
  @IsNotEmpty() spec: string;
  @IsOptional() unit?: string;
  @IsInt() @Min(1) shelfLifeDays: number;
  @IsOptional() coldChainRequired?: boolean;
  @IsOptional() tempZone?: string;
  @IsOptional() packagingType?: string;
  @IsOptional() pressureResistance?: string;
  @IsOptional() description?: string;
}

class BatchDto {
  @IsInt() @Min(1) quantity: number;
  @IsNotEmpty() harvestDate: string;
  @IsNotEmpty() harvestWindowEnd: string;
  @IsNotEmpty() supplyPrice: number;
  @IsOptional() testReportNo?: string;
  @IsOptional() testReportExpiry?: string;
  @IsOptional() livestreamAvailable?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Farmer) private farmers: Repository<Farmer>,
    private risks: RisksService,
    private farmersSvc: FarmersService,
  ) {}

  async createProduct(dto: ProductDto, user: any) {
    const farmerId = await this.resolveFarmerId(user);
    const p = this.products.create({ ...dto, farmerId, status: 'submitted' });
    return this.products.save(p);
  }

  private async resolveFarmerId(user: any): Promise<number> {
    if (user.role === 'farmer') {
      if (!user.farmerId) throw new ForbiddenException('当前账号未绑定农户');
      return user.farmerId;
    }
    throw new ForbiddenException('仅农户账号可提交商品');
  }

  async listProducts(user: any, query: any) {
    const where: any = {};
    if (user.role === 'farmer') where.farmerId = user.farmerId;
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    const list = await this.products.find({ where, order: { id: 'DESC' } });
    return list.map((p) => ({ ...p, reachableCities: reachableCities(p.tempZone) }));
  }

  async reviewProduct(id: number, body: { status: string; note?: string }) {
    const p = await this.products.findOne({ where: { id } });
    if (!p) throw new NotFoundException('商品不存在');
    if (!['approved', 'rejected'].includes(body.status)) {
      throw new BadRequestException('审核状态不合法');
    }
    p.status = body.status;
    p.reviewNote = body.note || null;
    return this.products.save(p);
  }

  async createBatch(productId: number, dto: BatchDto, user: any) {
    const p = await this.products.findOne({ where: { id: productId } });
    if (!p) throw new NotFoundException('商品不存在');
    if (user.role === 'farmer' && p.farmerId !== user.farmerId) {
      throw new ForbiddenException('只能为自己的商品创建批次');
    }
    const batchNo = `B${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const b = this.batches.create({
      ...dto,
      supplyPrice: dto.supplyPrice as any,
      productId,
      batchNo,
      availableQty: dto.quantity,
      status: 'pending',
    });
    const saved = await this.batches.save(b);
    await this.farmersSvc.recomputeStats(p.farmerId);
    return saved;
  }

  async listBatches(user: any, query: any) {
    const qb = this.batches
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.product', 'p')
      .leftJoinAndSelect('p.farmer', 'f')
      .orderBy('b.id', 'DESC');
    if (user.role === 'farmer') qb.andWhere('p.farmer_id = :fid', { fid: user.farmerId });
    if (query.status) qb.andWhere('b.status = :st', { st: query.status });
    if (query.available === '1') qb.andWhere('b.livestream_available = true');
    const list = await qb.getMany();
    const today = new Date().toISOString().slice(0, 10);
    return list.map((b) => ({
      ...b,
      reportExpired: !!b.testReportExpiry && b.testReportExpiry < today,
      reportDaysLeft: b.testReportExpiry
        ? Math.ceil((new Date(b.testReportExpiry).getTime() - Date.now()) / 86400000)
        : null,
    }));
  }

  async getBatch(id: number) {
    const b = await this.batches.findOne({ where: { id } });
    if (!b) throw new NotFoundException('批次不存在');
    return b;
  }

  /** 农户临时少供：调减可供数量，触发风险并影响农户稳定性 */
  async reduceSupply(id: number, newQty: number, user: any) {
    const b = await this.getBatch(id);
    if (user.role === 'farmer' && b.product.farmerId !== user.farmerId) {
      throw new ForbiddenException('只能调整自己的批次');
    }
    if (newQty >= b.quantity) throw new BadRequestException('新供货量必须小于原供货量');
    if (newQty < b.soldQty) {
      throw new BadRequestException(`新供货量不能低于已售 ${b.soldQty} 件`);
    }
    const locked = b.quantity - b.availableQty; // 已被锁定/售出的部分
    b.quantity = newQty;
    b.availableQty = Math.max(0, newQty - locked);
    await this.batches.save(b);
    await this.risks.emit(
      'undersupply',
      'critical',
      `批次 ${b.batchNo}（${b.product.name}）农户临时少供：供货量下调至 ${newQty} 件，可售库存 ${b.availableQty} 件`,
      b.id,
    );
    await this.farmersSvc.recomputeStats(b.product.farmerId);
    return b;
  }

  /** 上报批次坏果率（仓库抽检/售后汇总），超过阈值触发风险 */
  async reportDefect(id: number, rate: number) {
    const b = await this.getBatch(id);
    b.defectRate = rate;
    await this.batches.save(b);
    if (rate >= 0.05) {
      await this.risks.emit(
        'defect_rising',
        rate >= 0.1 ? 'critical' : 'warning',
        `批次 ${b.batchNo}（${b.product.name}）坏果率升至 ${(rate * 100).toFixed(1)}%，超过 5% 预警线`,
        b.id,
      );
    }
    await this.farmersSvc.recomputeStats(b.product.farmerId);
    return b;
  }

  /** 扫描检测报告过期：对在售/锁定批次生成风险事件 */
  async scanExpiredReports() {
    const today = new Date().toISOString().slice(0, 10);
    const actives = await this.batches
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.product', 'p')
      .where('b.status IN (:...sts)', { sts: ['qc_passed', 'locked', 'on_sale'] })
      .andWhere('b.test_report_expiry IS NOT NULL')
      .andWhere('b.test_report_expiry < :today', { today })
      .getMany();
    for (const b of actives) {
      await this.risks.emit(
        'report_expired',
        'critical',
        `批次 ${b.batchNo}（${b.product.name}）检测报告已于 ${b.testReportExpiry} 过期，状态 ${b.status}，需下架或复检`,
        b.id,
      );
    }
    return { scanned: actives.length };
  }
}

@Controller()
export class ProductsController {
  constructor(private svc: ProductsService) {}

  @Post('products')
  @Roles('farmer')
  createProduct(@Body() dto: ProductDto, @ReqUser() user: any) {
    return this.svc.createProduct(dto, user);
  }

  @Get('products')
  listProducts(@ReqUser() user: any, @Query() q: any) {
    return this.svc.listProducts(user, q);
  }

  @Patch('products/:id/review')
  @Roles('operator')
  review(@Param('id') id: string, @Body() body: any) {
    return this.svc.reviewProduct(+id, body);
  }

  @Post('products/:id/batches')
  @Roles('farmer', 'operator')
  createBatch(@Param('id') id: string, @Body() dto: BatchDto, @ReqUser() user: any) {
    return this.svc.createBatch(+id, dto, user);
  }

  @Get('batches')
  listBatches(@ReqUser() user: any, @Query() q: any) {
    return this.svc.listBatches(user, q);
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.svc.getBatch(+id);
  }

  @Post('batches/:id/reduce-supply')
  @Roles('farmer', 'operator')
  reduceSupply(@Param('id') id: string, @Body() body: { quantity: number }, @ReqUser() user: any) {
    return this.svc.reduceSupply(+id, +body.quantity, user);
  }

  @Post('batches/:id/defect')
  @Roles('operator', 'warehouse')
  reportDefect(@Param('id') id: string, @Body() body: { rate: number }) {
    return this.svc.reportDefect(+id, +body.rate);
  }

  @Post('batches/scan-expired-reports')
  @Roles('operator')
  scan() {
    return this.svc.scanExpiredReports();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Product, Batch, Farmer])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

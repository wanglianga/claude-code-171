import { Controller, Get, Global, Injectable, Module, Param } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farmer } from '../../entities/farmer.entity';
import { Batch } from '../../entities/batch.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { Order } from '../../entities/order.entity';

@Injectable()
export class FarmersService {
  constructor(
    @InjectRepository(Farmer) private farmers: Repository<Farmer>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    @InjectRepository(Order) private orders: Repository<Order>,
  ) {}

  findAll() {
    return this.farmers.find({ order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.farmers.findOne({ where: { id } });
  }

  /**
   * 依据批次链路数据重算农户稳定性：
   * 履约率(足量供货批次占比) × 坏果率惩罚 × 售后率惩罚
   */
  async recomputeStats(farmerId: number) {
    const farmer = await this.farmers.findOne({ where: { id: farmerId } });
    if (!farmer) return null;
    const batches = await this.batches.find({
      where: { product: { farmer: { id: farmerId } } as any },
      relations: ['product'],
    });
    const owned = batches.filter((b) => b.product && b.product.farmerId === farmerId);
    const total = owned.length;
    const fulfilled = owned.filter((b) => b.status !== 'qc_failed').length;
    const defectAvg =
      total > 0 ? owned.reduce((s, b) => s + (b.defectRate || 0), 0) / total : 0;

    let aftersalesRate = 0;
    if (owned.length > 0) {
      const batchIds = owned.map((b) => b.id);
      const orderCount = await this.orders
        .createQueryBuilder('o')
        .where('o.batch_id IN (:...ids)', { ids: batchIds.length ? batchIds : [0] })
        .getCount();
      const ticketCount = await this.aftersales
        .createQueryBuilder('a')
        .where('a.batch_id IN (:...ids)', { ids: batchIds.length ? batchIds : [0] })
        .getCount();
      aftersalesRate = orderCount > 0 ? ticketCount / orderCount : 0;
    }

    const fulfillRate = total > 0 ? fulfilled / total : 1;
    const stability = Math.max(
      0,
      Math.min(1, fulfillRate * (1 - defectAvg) * (1 - Math.min(aftersalesRate, 1) * 0.8)),
    );
    farmer.totalBatches = total;
    farmer.fulfilledBatches = fulfilled;
    farmer.avgDefectRate = Math.round(defectAvg * 10000) / 10000;
    farmer.aftersalesRate = Math.round(aftersalesRate * 10000) / 10000;
    farmer.stabilityScore = Math.round(stability * 1000) / 1000;
    return this.farmers.save(farmer);
  }
}

@Controller('farmers')
export class FarmersController {
  constructor(private svc: FarmersService) {}

  @Get()
  list() {
    return this.svc.findAll();
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.svc.findOne(+id);
  }

  @Get(':id/recompute')
  recompute(@Param('id') id: string) {
    return this.svc.recomputeStats(+id);
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Farmer, Batch, Aftersale, Order])],
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}

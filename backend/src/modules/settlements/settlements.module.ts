import {
  BadRequestException,
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
import { Settlement } from '../../entities/settlement.entity';
import { Livestream } from '../../entities/livestream.entity';
import { Batch } from '../../entities/batch.entity';
import { Order } from '../../entities/order.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { FarmersService } from '../farmers/farmers.module';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement) private settlements: Repository<Settlement>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    private farmersSvc: FarmersService,
  ) {}

  /**
   * 按直播场次生成农户结算单：
   * 应收 = 已售件数 × 供货价；扣减 = 该批次已解决工单的退款中农户承担部分
   */
  async generate(livestreamId: number) {
    const ls = await this.livestreams.findOne({ where: { id: livestreamId } });
    if (!ls) throw new NotFoundException('直播场次不存在');
    if (ls.status !== 'ended') throw new BadRequestException('仅已结束的场次可结算');
    const existing = await this.settlements.findOne({ where: { livestreamId } });
    if (existing) throw new BadRequestException('该场次已生成结算单');
    const batch = await this.batches.findOne({ where: { id: ls.batchId } });
    const orders = await this.orders.find({ where: { livestreamId } });
    const qty = orders.reduce((s, o) => s + o.quantity, 0);
    const gross = qty * Number(batch.supplyPrice);
    const tickets = await this.aftersales.find({
      where: { batchId: batch.id, status: 'resolved' },
    });
    const refund = tickets.reduce((s, t) => s + Number(t.refundAmount || 0), 0);
    const net = Math.max(0, gross - refund);
    const rec = this.settlements.create({
      farmerId: batch.product.farmerId,
      batchId: batch.id,
      livestreamId: ls.id,
      orderCount: orders.length,
      grossAmount: gross.toFixed(2) as any,
      refundAmount: refund.toFixed(2) as any,
      netAmount: net.toFixed(2) as any,
      status: 'pending',
    });
    const saved = await this.settlements.save(rec);
    await this.farmersSvc.recomputeStats(batch.product.farmerId);
    return saved;
  }

  async list(user: any, query: any) {
    const where: any = {};
    if (user.role === 'farmer') where.farmerId = user.farmerId;
    if (query.status) where.status = query.status;
    return this.settlements.find({ where, order: { id: 'DESC' } });
  }

  async pay(id: number) {
    const s = await this.settlements.findOne({ where: { id } });
    if (!s) throw new NotFoundException('结算单不存在');
    if (s.status === 'settled') throw new BadRequestException('已结算');
    s.status = 'settled';
    s.settledAt = new Date();
    return this.settlements.save(s);
  }
}

@Controller('settlements')
export class SettlementsController {
  constructor(private svc: SettlementsService) {}

  @Post('generate/:livestreamId')
  @Roles('operator')
  generate(@Param('livestreamId') id: string) {
    return this.svc.generate(+id);
  }

  @Get()
  list(@ReqUser() user: any, @Query() q: any) {
    return this.svc.list(user, q);
  }

  @Post(':id/pay')
  @Roles('operator')
  pay(@Param('id') id: string) {
    return this.svc.pay(+id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Livestream, Batch, Order, Aftersale]),
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}

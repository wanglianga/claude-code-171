import { Body, Controller, Get, Injectable, Module, Param, Patch, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Global } from '@nestjs/common';
import { RiskEvent, RISK_TYPES } from '../../entities/risk-event.entity';
import { Roles } from '../../common/decorators';

@Injectable()
export class RisksService {
  constructor(
    @InjectRepository(RiskEvent) private risks: Repository<RiskEvent>,
  ) {}

  /** 各业务模块统一通过此方法上报风险事件 */
  async emit(
    type: keyof typeof RISK_TYPES,
    level: 'info' | 'warning' | 'critical',
    message: string,
    batchId?: number,
    livestreamId?: number,
  ) {
    const ev = this.risks.create({
      type,
      level,
      message,
      batchId: batchId ?? null,
      livestreamId: livestreamId ?? null,
    });
    return this.risks.save(ev);
  }

  list(query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.batchId) where.batchId = +query.batchId;
    return this.risks.find({ where, order: { id: 'DESC' }, take: 200 });
  }

  async setStatus(id: number, status: string) {
    await this.risks.update(id, { status });
    return this.risks.findOne({ where: { id } });
  }

  typeDict() {
    return RISK_TYPES;
  }
}

@Controller('risks')
export class RisksController {
  constructor(private svc: RisksService) {}

  @Get()
  @Roles('operator', 'warehouse', 'aftersales')
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get('types')
  types() {
    return this.svc.typeDict();
  }

  @Patch(':id/status')
  @Roles('operator')
  setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.svc.setStatus(+id, body.status);
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RiskEvent])],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}

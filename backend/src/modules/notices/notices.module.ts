import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNotEmpty, IsOptional } from 'class-validator';
import { BrandNotice } from '../../entities/brand-notice.entity';
import { Roles } from '../../common/decorators';

class NoticeDto {
  @IsNotEmpty() title: string;
  @IsNotEmpty() content: string;
  @IsOptional() level?: string;
  @IsOptional() batchId?: number;
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(BrandNotice) private notices: Repository<BrandNotice>,
  ) {}

  create(dto: NoticeDto) {
    const n = this.notices.create({
      title: dto.title,
      content: dto.content,
      level: dto.level || 'info',
      batchId: dto.batchId ?? null,
      status: 'draft',
    });
    return this.notices.save(n);
  }

  list() {
    return this.notices.find({ order: { id: 'DESC' } });
  }

  async publish(id: number) {
    const n = await this.notices.findOne({ where: { id } });
    if (!n) throw new NotFoundException('公告不存在');
    n.status = 'published';
    return this.notices.save(n);
  }
}

@Controller('notices')
export class NoticesController {
  constructor(private svc: NoticesService) {}

  @Post()
  @Roles('operator')
  create(@Body() dto: NoticeDto) {
    return this.svc.create(dto);
  }

  @Get()
  list() {
    return this.svc.list();
  }

  @Post(':id/publish')
  @Roles('operator')
  publish(@Param('id') id: string) {
    return this.svc.publish(+id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([BrandNotice])],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}

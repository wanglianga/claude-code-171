import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  User, Farmer, Product, Batch, Selection, LiveSession, LiveItem, InventoryLock,
  Order, Shipment, AfterSale, Settlement, RiskAlert, BrandNotice,
} from './entities';
import { JwtModule } from '@nestjs/jwt';
import { RiskService } from './risk.service';
import { SeedService } from './seed.service';
import { AuthController } from './controllers/auth.controller';
import { CatalogController } from './controllers/catalog.controller';
import { OpsController } from './controllers/ops.controller';
import { FulfillController } from './controllers/fulfill.controller';
import { InsightController } from './controllers/insight.controller';

const entities = [
  User, Farmer, Product, Batch, Selection, LiveSession, LiveItem, InventoryLock,
  Order, Shipment, AfterSale, Settlement, RiskAlert, BrandNotice,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5433,
      username: process.env.DB_USER || 'agri',
      password: process.env.DB_PASSWORD || 'agri',
      database: process.env.DB_NAME || 'agri_platform',
      entities,
      synchronize: true,
    }),
    TypeOrmModule.forFeature(entities),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'dev-secret', signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [AuthController, CatalogController, OpsController, FulfillController, InsightController],
  providers: [RiskService, SeedService],
})
export class AppModule implements OnModuleInit {
  constructor(private seed: SeedService) {}
  async onModuleInit() {
    if ((process.env.SEED_ON_BOOT ?? 'true') !== 'false') {
      await this.seed.run();
    }
  }
}

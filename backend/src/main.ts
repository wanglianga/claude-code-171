import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN || '*').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
  console.log(`Backend listening on http://0.0.0.0:${process.env.PORT || 3000}/api`);
}
bootstrap();

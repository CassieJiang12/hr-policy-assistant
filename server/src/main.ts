import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SafeExceptionFilter } from './http/safe-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new SafeExceptionFilter());
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

await bootstrap();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AskModule } from './ask/ask.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    HealthModule,
    AskModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './modules/auth/auth.module';
import { RulesModule } from './modules/rules/rules.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, RulesModule],
})
export class AppModule {}

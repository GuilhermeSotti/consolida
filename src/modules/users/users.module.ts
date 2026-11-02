import { Module } from '@nestjs/common';
import { TOKENS, type AuditRecorder, type TransactionRunner } from '../../shared/application/ports';
import { USERS_REPOSITORY, type UsersRepository } from './application/ports';
import { UsersService } from './application/users.service';
import { PrismaUsersRepository } from './infrastructure/prisma-users.repository';
import { RolesController, UsersController } from './presentation/users.controller';

@Module({
  controllers: [UsersController, RolesController],
  providers: [
    { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository },
    {
      provide: UsersService,
      useFactory: (users: UsersRepository, transactions: TransactionRunner, audit: AuditRecorder) => new UsersService(users, transactions, audit),
      inject: [USERS_REPOSITORY, TOKENS.TRANSACTION_RUNNER, TOKENS.AUDIT_RECORDER],
    },
  ],
})
export class UsersModule {}

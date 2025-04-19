import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  providers: [BlockchainService, PrismaService],
  exports: [BlockchainService],
})
export class BlockchainModule {}

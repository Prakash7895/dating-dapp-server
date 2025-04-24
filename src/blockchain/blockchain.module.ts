import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from 'src/prisma.service';
import { WebSocketGateway } from 'src/web-socket/web-socket.gateway';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { UploadService } from 'src/upload/upload.service';

@Module({
  providers: [
    BlockchainService,
    PrismaService,
    WebSocketGateway,
    JwtStrategy,
    UploadService,
  ],
  exports: [BlockchainService],
})
export class BlockchainModule {}

import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from 'src/prisma.service';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { UploadService } from 'src/upload/upload.service';
import { WebSocketModule } from 'src/web-socket/web-socket.module';

@Module({
  imports: [WebSocketModule],
  providers: [BlockchainService, PrismaService, JwtStrategy, UploadService],
  exports: [BlockchainService],
})
export class BlockchainModule {}

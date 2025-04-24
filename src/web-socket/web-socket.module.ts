import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebSocketGateway } from './web-socket.gateway';
import { PrismaService } from 'src/prisma.service';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { UploadService } from 'src/upload/upload.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [WebSocketGateway, PrismaService, JwtStrategy, UploadService],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}

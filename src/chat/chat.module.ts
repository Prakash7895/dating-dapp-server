import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaService } from 'src/prisma.service';
import { UploadService } from 'src/upload/upload.service';
import { WebSocketModule } from 'src/web-socket/web-socket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [ChatController],
  providers: [ChatService, PrismaService, UploadService],
})
export class ChatModule {}

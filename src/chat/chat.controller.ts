import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';
import { RequestWithUser } from 'src/types';
import { PaginationDto } from 'src/common.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getChats(@Req() req: RequestWithUser, @Query() pagination: PaginationDto) {
    return this.chatService.getChats(req.user, pagination);
  }

  @Get('/:roomId')
  @UseGuards(JwtAuthGuard)
  getChatMessages(
    @Req() req: RequestWithUser,
    @Param('roomId') roomId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.chatService.getChatMessages(roomId, req.user, pagination);
  }
}

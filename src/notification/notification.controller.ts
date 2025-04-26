import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PaginationDto } from 'src/common.dto';
import { RequestWithUser } from 'src/types';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';
import { NudgeDto } from './dto/nudge.dto';

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getNotifications(@Req() req: RequestWithUser, @Query() query: PaginationDto) {
    return this.notificationService.getNotifications(query, req.user);
  }

  @Put('/read/:id')
  @UseGuards(JwtAuthGuard)
  readNotification(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.notificationService.readNotification(id, req.user);
  }

  @Post('/nudge')
  @UseGuards(JwtAuthGuard)
  addNudgeNotification(@Req() req: RequestWithUser, @Body() body: NudgeDto) {
    return this.notificationService.addNudgeNotification(req.user, body);
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  deleteNotification(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.notificationService.deleteNotification(id, req.user);
  }
}

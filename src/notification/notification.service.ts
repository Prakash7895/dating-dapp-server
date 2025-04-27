import { BadRequestException, Injectable } from '@nestjs/common';
import { PaginationDto } from 'src/common.dto';
import { PrismaService } from 'src/prisma.service';
import { JwtPayload } from 'src/types';
import { NotificationType, NudgeDto } from './dto/nudge.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(query: PaginationDto, user: JwtPayload) {
    try {
      const { pageNo, pageSize } = query;

      const take = pageSize || 10;
      const skip = pageNo ? (pageNo - 1) * take : 0;

      const whereQuery = {
        userId: user.userId,
        status: true,
      };

      const notifications = await this.prisma.notification.findMany({
        take,
        skip,
        orderBy: {
          createdAt: 'desc',
        },
        where: whereQuery,
      });

      return {
        status: 'success',
        message: 'Notifications fetched successfully',
        data: notifications,
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to get notifications',
        message: error.message,
        status: 'error',
      });
    }
  }

  async readNotification(notificationId: string, user: JwtPayload) {
    try {
      const notification = await this.prisma.notification.findUnique({
        where: {
          id: notificationId,
          userId: user.userId,
          status: true,
        },
      });

      if (!notification) {
        throw new BadRequestException({
          message: 'Notification not found',
          status: 'error',
        });
      }

      await this.prisma.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          read: true,
        },
      });

      return {
        status: 'success',
        message: 'Notification marked as read successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to mark notification as read',
        message: error.message,
        status: 'error',
      });
    }
  }

  async addNudgeNotification(user: JwtPayload, body: NudgeDto) {
    try {
      const { userId } = body;

      const userExists = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!userExists) {
        throw new BadRequestException({
          message: 'User not found',
          status: 'error',
        });
      }

      const title = `${user.firstName} ${user.lastName} nudged you!`;
      const content = `<b>${user.firstName} ${user.lastName}</b> nudged you to add wallet address.`;

      await this.prisma.notification.create({
        data: {
          title,
          content,
          type: NotificationType.NUDGE,
          nudgerId: user.userId,
          userId: userId,
          read: false,
        },
      });

      return {
        status: 'success',
        message: 'Nudged successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to nudge user',
        message: error.message,
        status: 'error',
      });
    }
  }

  async deleteNotification(notificationId: string, user: JwtPayload) {
    try {
      const notification = await this.prisma.notification.findUnique({
        where: {
          id: notificationId,
          userId: user.userId,
        },
      });

      if (!notification) {
        throw new BadRequestException({
          message: 'Notification not found',
          status: 'error',
        });
      }

      await this.prisma.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          status: false,
        },
      });

      return {
        status: 'success',
        message: 'Notification deleted successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to delete notification',
        message: error.message,
        status: 'error',
      });
    }
  }
}

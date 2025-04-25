import { BadRequestException, Injectable } from '@nestjs/common';
import { PaginationDto } from 'src/common.dto';
import { PrismaService } from 'src/prisma.service';
import { JwtPayload } from 'src/types';
import { UploadService } from 'src/upload/upload.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async getChats(user: JwtPayload, pagination: PaginationDto) {
    try {
      const { pageNo, pageSize } = pagination;

      const take = pageSize;
      const skip = (pageNo - 1) * pageSize;

      const chats = await this.prismaService.chatRoom.findMany({
        take,
        skip,
        where: {
          OR: [{ userAId: user.userId }, { userBId: user.userId }],
        },
        select: {
          id: true,
          userA: {
            select: {
              id: true,
              profile: true,
            },
          },
          userB: {
            select: {
              id: true,
              profile: true,
            },
          },
          messages: {
            take: 1,
            skip: 0,
            orderBy: {
              createdAt: 'desc',
            },
          },
          _count: {
            select: {
              messages: {
                where: {
                  senderId: { not: user.userId },
                  read: false,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      const ch = chats.map((el) => ({
        ...(el.userA.id === user.userId ? el.userB.profile : el.userA.profile),
        roomId: el.id,
        lastMessage: el.messages?.[0] ?? null,
        unreadCount: el._count?.messages || 0,
      }));

      for (const c of ch) {
        if (c.profilePicture) {
          c.profilePicture = await this.uploadService.getSignedUrl(
            c.profilePicture,
          );
        }
      }

      return {
        status: 'success',
        data: ch ?? [],
      };
    } catch (err) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: err.message,
        status: 'error',
      });
    }
  }

  async getChatMessages(
    roomId: string,
    user: JwtPayload,
    pagination: PaginationDto,
  ) {
    try {
      const { pageNo, pageSize } = pagination;

      const take = pageSize;
      const skip = (pageNo - 1) * pageSize;

      const room = await this.prismaService.chatRoom.findFirst({
        where: { id: roomId },
      });

      if (!room) {
        throw new Error('Room does not exists');
      }

      if (!(room?.userAId === user.userId || room?.userBId === user.userId)) {
        throw new Error('Room Does not belong to you');
      }

      const messages = await this.prismaService.chatMessage.findMany({
        take,
        skip,
        where: {
          roomId: roomId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        status: 'success',
        data: messages.reverse(),
      };
    } catch (err) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: err.message,
        status: 'error',
      });
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PaginationDto } from 'src/common.dto';
import { PrismaService } from 'src/prisma.service';
import { JwtPayload } from 'src/types';
import { UploadService } from 'src/upload/upload.service';
import { WebSocketGateway } from 'src/web-socket/web-socket.gateway';

@Injectable()
export class ChatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly uploadService: UploadService,
    private readonly wsGateway: WebSocketGateway,
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

      const unreceivedCounts = await this.prismaService.chatRoom.findMany({
        where: {
          id: { in: chats.map((el) => el.id) },
        },
        select: {
          id: true,
          _count: {
            select: {
              messages: {
                where: {
                  senderId: { not: user.userId },
                  received: false,
                },
              },
            },
          },
        },
      });

      const ch = chats.map((el) => ({
        ...(el.userA.id === user.userId ? el.userB.profile : el.userA.profile),
        roomId: el.id,
        lastMessage: el.messages?.[0] ?? null,
        unreadCount: el._count?.messages || 0,
        unreceivedCount:
          unreceivedCounts.find((c) => c.id === el.id)?._count?.messages || 0,
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
        data: messages,
      };
    } catch (err) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: err.message,
        status: 'error',
      });
    }
  }

  async markReceived(user: JwtPayload) {
    try {
      const chat = await this.prismaService.chatRoom.findMany({
        where: {
          OR: [{ userAId: user.userId }, { userBId: user.userId }],
        },
      });

      if (!chat) {
        return {
          status: 'success',
          message: 'No chats found',
        };
      }
      const chatIds = chat.map((el) => el.id);
      const messages = await this.prismaService.chatMessage.findMany({
        where: {
          roomId: { in: chatIds },
          senderId: { not: user.userId },
          received: false,
        },
      });

      const messageIds = messages.map((el) => el.id);
      if (messageIds.length) {
        await this.prismaService.chatMessage.updateMany({
          where: {
            id: { in: messageIds },
          },
          data: {
            received: true,
          },
        });

        this.wsGateway.emitMessageReceivedEvent(user.userId);
      }

      return {
        status: 'success',
        message: 'Messages marked as received',
      };
    } catch (err) {
      throw new BadRequestException({
        message: 'Failed to mark message received',
        error: err.message,
        status: 'error',
      });
    }
  }
}

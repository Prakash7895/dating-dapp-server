import {
  WebSocketGateway as WebSocketGatewayDecorator,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma.service';
import { UseGuards } from '@nestjs/common';
import { JwtPayload } from 'src/types';
import { WsJwtGuard } from 'src/ws-jwt/ws-jwt.guard';
import { WsUser } from 'src/ws-user/ws-user.decorator';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { UploadService } from 'src/upload/upload.service';

interface UserSocket extends Socket {
  user?: JwtPayload;
}

enum CHAT_EVENTS {
  JOIN_ROOM = 'joinRoom',
  LEAVE_ROOM = 'leaveRoom',
  SEND_MESSAGE = 'sendMessage',
  START_TYPING = 'startTyping',
  STOP_TYPING = 'stopTyping',
  MESSAGE_RECEIVED = 'messageReceived',
  MESSAGE_READ = 'messageRead',
}

enum EMIT_EVENTS {
  INITIAL_ONLINE_STATUSES = 'initialOnlineStatuses',
  USER_TYPING = 'userTyping',
  NEW_MESSAGE = 'newMessage',
  MESSAGE_STATUS = 'messageStatus',
}

@WebSocketGatewayDecorator({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private userSockets: Map<string, Set<string>> = new Map();
  private typingUsers: Map<string, Set<string>> = new Map();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private jwtStrategy: JwtStrategy,
    private uploadService: UploadService,
  ) {}

  async handleConnection(@ConnectedSocket() client: UserSocket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      // Use existing JWT validation
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      // Use existing strategy to validate payload
      const user = await this.jwtStrategy.validate(payload);

      if (!user) {
        client.disconnect();
        return;
      }

      // Attach user to socket
      client.user = user;

      // Add user socket connection
      this.addUserSocket(user.userId, client.id);
      console.log(`Client connected: ${client.id} (User: ${user.userId})`);

      // Send initial online status of all matched users
      const onlineStatuses = await this.getOnlineStatusesForChats(user.userId);
      this.emitToUser(
        user.userId,
        EMIT_EVENTS.INITIAL_ONLINE_STATUSES,
        onlineStatuses,
      );

      // Broadcast this user's online status to others
      this.broadcastUserStatus(user.userId, true);
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  private async getOnlineStatusesForChats(userId: string) {
    const chats = await this.prisma.chatRoom.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: {
        userAId: true,
        userBId: true,
      },
    });

    const onlineStatuses: { userId: string; online: boolean }[] = [];

    chats.forEach((c) => {
      // For each c, check online status of the other user
      const otherUserId = c.userAId === userId ? c.userBId : c.userAId;

      onlineStatuses.push({
        userId: otherUserId,
        online: this.isUserOnline(otherUserId),
      });
    });

    return onlineStatuses;
  }

  async handleDisconnect(@ConnectedSocket() client: UserSocket) {
    if (client.user) {
      this.removeUserSocket(client.user.userId, client.id);
      this.broadcastUserStatus(client.user.userId, false);
    }
  }

  // User online status management
  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);
    this.broadcastUserStatus(userId, true);
  }

  private removeUserSocket(userId: string, socketId: string) {
    this.userSockets.get(userId)?.delete(socketId);
    if (this.userSockets.get(userId)?.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  private isUserOnline(userId: string): boolean {
    return (
      this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0
    );
  }

  // Add to WebSocketGateway class
  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() roomId: string,
    @WsUser() user: JwtPayload,
  ) {
    try {
      // Verify room exists and user has access
      const room = await this.prisma.chatRoom.findFirst({
        where: {
          id: roomId,
          OR: [{ userAId: user.userId }, { userBId: user.userId }],
        },
      });

      if (!room) {
        throw new WsException('Room not found or access denied');
      }

      // Join the Socket.IO room
      await client.join(roomId);

      return { status: 'joined' };
    } catch (error) {
      console.error('Error joining room:', error);
      throw new WsException('Failed to join room');
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() roomId: string,
  ) {
    await client.leave(roomId);
    return { status: 'left' };
  }

  // Chat message handlers
  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.SEND_MESSAGE)
  async handleMessage(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() payload: { roomId: string; content: string },
    @WsUser() user: JwtPayload,
  ) {
    const message = await this.prisma.chatMessage.create({
      data: {
        content: payload.content,
        roomId: payload.roomId,
        senderId: user.userId,
      },
      include: {
        sender: {
          select: {
            profile: true,
          },
        },
        room: true,
      },
    });

    const recipientId =
      message.room.userAId === user.userId
        ? message.room.userBId
        : message.room.userAId;

    if (message.sender.profile?.profilePicture) {
      message.sender.profile.profilePicture =
        await this.uploadService.getSignedUrl(
          message.sender.profile.profilePicture,
        );
    }

    // Emit to recipient
    this.emitToUser(recipientId, EMIT_EVENTS.NEW_MESSAGE, {
      ...message,
      received: false,
      read: false,
    });

    return message;
  }

  // Typing status handlers
  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.START_TYPING)
  async handleStartTyping(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() payload: { roomId: string },
    @WsUser() user: JwtPayload,
  ) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: payload.roomId },
    });

    if (!room) return;

    const recipientId =
      room.userAId === user.userId ? room.userBId : room.userAId;
    this.emitToUser(recipientId, EMIT_EVENTS.USER_TYPING, {
      roomId: payload.roomId,
      userId: user.userId,
      typing: true,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.STOP_TYPING)
  async handleStopTyping(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() payload: { roomId: string },
    @WsUser() user: JwtPayload,
  ) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: payload.roomId },
    });

    if (!room) return;

    const recipientId =
      room.userAId === user.userId ? room.userBId : room.userAId;
    this.emitToUser(recipientId, EMIT_EVENTS.USER_TYPING, {
      roomId: payload.roomId,
      userId: user.userId,
      typing: false,
    });
  }

  // Message status handlers
  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.MESSAGE_RECEIVED)
  async handleMessageReceived(
    @MessageBody() payload: { messageId: string },
    @WsUser() user: JwtPayload,
  ) {
    const message = await this.prisma.chatMessage.update({
      where: { id: payload.messageId },
      data: { received: true },
      include: { room: true },
    });

    this.emitToUser(message.senderId, EMIT_EVENTS.MESSAGE_STATUS, {
      messageId: message.id,
      status: 'received',
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(CHAT_EVENTS.MESSAGE_READ)
  async handleMessageRead(
    @MessageBody() payload: { messageId: string },
    @WsUser() user: JwtPayload,
  ) {
    const message = await this.prisma.chatMessage.update({
      where: { id: payload.messageId },
      data: { read: true },
      include: { room: true },
    });

    this.emitToUser(message.senderId, EMIT_EVENTS.MESSAGE_STATUS, {
      messageId: message.id,
      status: 'read',
    });
  }

  // Add method to get online users in a chat room
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('getRoomOnlineUsers')
  async getRoomOnlineUsers(@MessageBody() payload: { roomId: string }) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: payload.roomId },
      select: { userAId: true, userBId: true },
    });

    if (!room) return { online: [] };

    return {
      online: [
        { userId: room.userAId, isOnline: this.isUserOnline(room.userAId) },
        { userId: room.userBId, isOnline: this.isUserOnline(room.userBId) },
      ],
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('getRoomDetails')
  async handleGetRoomDetails(
    @MessageBody() roomId: string,
    @WsUser() user: JwtPayload,
  ) {
    try {
      const room = await this.prisma.chatRoom.findUnique({
        where: { id: roomId },
        include: {
          userA: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  profilePicture: true,
                },
              },
            },
          },
          userB: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  profilePicture: true,
                },
              },
            },
          },
          messages: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      if (!room) {
        throw new Error('Chat room not found');
      }

      // Verify user is part of this room
      if (room.userAId !== user.userId && room.userBId !== user.userId) {
        throw new Error('Unauthorized access to chat room');
      }

      // Format room data
      const otherUser = room.userAId === user.userId ? room.userB : room.userA;

      return {
        id: room.id,
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.profile?.firstName,
          lastName: otherUser.profile?.lastName,
          profilePicture: otherUser.profile?.profilePicture,
          isOnline: this.isUserOnline(otherUser.id),
        },
        lastMessage: room.messages[0] || null,
        userId: user.userId,
      };
    } catch (error) {
      console.error('Error getting room details:', error);
      throw new WsException('Failed to get room details');
    }
  }

  // Blockchain event handlers
  async emitLikeEvent(likerId: string, targetId: string) {
    this.emitToUser(targetId, 'newLike', {
      likerId,
      timestamp: new Date(),
    });
  }

  async emitMatchEvent(userAId: string, userBId: string) {
    const walletInfo = await this.prisma.multiSigWallet.findFirst({
      where: {
        OR: [
          {
            AND: [{ addressA: userAId }, { addressB: userBId }],
          },
          {
            AND: [{ addressA: userBId }, { addressB: userAId }],
          },
        ],
      },
      include: {
        userA: {
          select: {
            walletAddress: true,
            email: true,
            id: true,
            profile: true,
          },
        },
        userB: {
          select: {
            walletAddress: true,
            email: true,
            id: true,
            profile: true,
          },
        },
      },
    });

    // Emit to both users
    this.emitToUser(userAId, 'newMatch', {
      ...walletInfo,
      matchedWith: userBId,
    });

    this.emitToUser(userBId, 'newMatch', {
      ...walletInfo,
      matchedWith: userAId,
    });
  }

  // Helper methods
  private emitToUser(userId: string, event: string, data: any) {
    if (!this.isUserOnline(userId)) {
      console.log(`User ${userId} is offline, message queued`);
      // TODO: Implement message queuing for offline users
      return;
    }
    const userSocketIds = this.userSockets.get(userId);
    if (userSocketIds) {
      userSocketIds.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  private broadcastUserStatus(userId: string, online: boolean) {
    this.getOnlineStatusesForChats(userId).then((users) => {
      users.forEach((user) => {
        this.emitToUser(user.userId, 'userStatus', {
          userId,
          online,
        });
      });
    });
  }
}

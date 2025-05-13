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
  LOG_OUT = 'logOut',
  HEART_BEAT = 'heartbeat',
}

enum EMIT_EVENTS {
  INITIAL_ONLINE_STATUSES = 'initialOnlineStatuses',
  USER_TYPING = 'userTyping',
  NEW_MESSAGE = 'newMessage',
  MESSAGE_STATUS = 'messageStatus',
  USER_STATUS = 'userStatus',
  TOKEN_MISSING = 'tokenMissing',
  INVALID_TOKEN = 'invalidToken',
  MARK_ALL_RECEIVED = 'markAllReceived',
  NEW_MATCH_EVENT = 'newMatchEvent',
}

const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:3000'];
@WebSocketGatewayDecorator({
  cors: {
    origin: (origin, callback) => {
      console.log('[WS] Origin:', origin);
      console.log('[WS] FRONTEND_URL:', process.env.FRONTEND_URL);
      console.log('[WS] Allowed Origins:', allowedOrigins);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true); // Allow the request
      } else {
        callback(new Error('Not allowed by CORS')); // Reject the request
      }
    },
    credentials: true,
  },
})
export class WebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private jwtStrategy: JwtStrategy,
    private uploadService: UploadService,
  ) {
    console.log('WebSocketGateway instantiated');
  }

  async handleConnection(@ConnectedSocket() client: UserSocket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.emit(EMIT_EVENTS.TOKEN_MISSING, 'Token is missing');
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
        client.emit(EMIT_EVENTS.INVALID_TOKEN, 'Invalid or expired token');
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
      console.log('Connection error:', error.message);
      client.emit(EMIT_EVENTS.INVALID_TOKEN, 'Invalid or expired token');
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

    return onlineStatuses.filter((el) => el.online);
  }

  async handleDisconnect(@ConnectedSocket() client: UserSocket) {
    if (client.user) {
      this.removeUserSocket(client.user.userId, client.id);
      this.broadcastUserStatus(client.user.userId, false);
      console.log(
        `Client disconnected: ${client.id} (User: ${client.user.userId})`,
      );
    } else {
      console.log(`Client disconnected: ${client.id}`);
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

  @SubscribeMessage(CHAT_EVENTS.HEART_BEAT)
  async handleHeartbeat(@ConnectedSocket() client: UserSocket) {
    console.log(`Heartbeat received from client: ${client.user?.userId}`);

    return {
      status: 'alive',
    };
  }

  @SubscribeMessage(CHAT_EVENTS.LOG_OUT)
  async handleLogout(@ConnectedSocket() client: UserSocket) {
    if (client.user) {
      this.removeUserSocket(client.user.userId, client.id);
      console.log(`User ${client.user.userId} logged out, socket removed`);
      client.disconnect();
    }
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

    await this.prisma.chatRoom.update({
      where: { id: payload.roomId },
      data: {
        updatedAt: new Date(),
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

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        roomId: payload.roomId,
        senderId: user.userId,
        read: false,
      },
    });

    // Emit to recipient
    this.emitToUser(recipientId, EMIT_EVENTS.NEW_MESSAGE, {
      ...message,
      received: false,
      read: false,
      unreadCount,
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
    try {
      const message = await this.prisma.chatMessage.findUnique({
        where: { id: payload.messageId },
      });
      if (message && !message.read) {
        await this.prisma.chatMessage.update({
          where: { id: payload.messageId },
          data: { read: true },
        });

        this.emitToUser(message.senderId, EMIT_EVENTS.MESSAGE_STATUS, {
          messageId: message.id,
          status: 'read',
        });
        return { status: 'success', message: 'Message marked as read' };
      }

      // Send acknowledgment back to the client
      return { status: 'error', message: 'Message already marked as read' };
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw new WsException('Failed to mark message as read');
    }
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

  async emitMatchEvent(userAAddress: string, userBAddress: string) {
    const walletInfo = await this.prisma.multiSigWallet.findFirst({
      where: {
        OR: [
          {
            AND: [{ addressA: userAAddress }, { addressB: userBAddress }],
          },
          {
            AND: [{ addressA: userBAddress }, { addressB: userAAddress }],
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

    const multiSigWallet = {
      addressA: walletInfo?.addressA,
      addressB: walletInfo?.addressB,
      id: walletInfo?.id,
      createdAt: walletInfo?.createdAt,
      updatedAt: walletInfo?.updatedAt,
      walletAddress: walletInfo?.walletAddress,
    };

    const userAData = { ...walletInfo?.userA, multiSigWallet };
    const userBData = { ...walletInfo?.userB, multiSigWallet };

    const chatRoom = await this.prisma.chatRoom.findFirst({
      where: {
        OR: [
          {
            AND: [{ userAId: userAData.id }, { userBId: userBData.id }],
          },
          {
            AND: [{ userAId: userBData.id }, { userBId: userAData.id }],
          },
        ],
      },
    });

    if (userAData.profile?.profilePicture) {
      userAData.profile.profilePicture = await this.uploadService.getSignedUrl(
        userAData.profile.profilePicture,
      );
    }

    if (userBData.profile?.profilePicture) {
      userBData.profile.profilePicture = await this.uploadService.getSignedUrl(
        userBData.profile.profilePicture,
      );
    }

    // Emit to both users
    if (userAData.id && this.isUserOnline(userAData.id)) {
      this.emitToUser(userAData.id, EMIT_EVENTS.NEW_MATCH_EVENT, {
        ...userBData,
        userAId: userAData.id,
        userBId: userBData.id,
        chatRoomId: chatRoom?.id,
      });
    }

    if (userBData.id && this.isUserOnline(userBData.id)) {
      this.emitToUser(userBData.id, EMIT_EVENTS.NEW_MATCH_EVENT, {
        ...userAData,
        userAId: userAData.id,
        userBId: userBData.id,
        chatRoomId: chatRoom?.id,
      });
    }
  }

  async emitMessageReceivedEvent(forUserId: string) {
    try {
      const chats = await this.prisma.chatRoom.findMany({
        where: {
          OR: [{ userAId: forUserId }, { userBId: forUserId }],
        },
      });

      if (chats.length) {
        for (const chat of chats) {
          const userId =
            chat.userAId === forUserId ? chat.userBId : chat.userAId;

          this.emitToUser(userId, EMIT_EVENTS.MARK_ALL_RECEIVED, {
            roomId: chat.id,
          });
        }
      }

      // Send acknowledgment back to the client
      return { status: 'success', message: 'Message marked as read' };
    } catch (error) {
      console.error('Error emitting message recived event:', error);
      throw new WsException('Failed to emit message received event');
    }
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
        this.emitToUser(user.userId, EMIT_EVENTS.USER_STATUS, {
          userId,
          online,
        });
      });
    });
  }
}

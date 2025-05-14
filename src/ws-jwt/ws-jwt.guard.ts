import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      const token = client.handshake.auth.token;


      console.log('[WsJwtGuard] Token received:', token);

      if (!token) {
        throw new WsException('Missing token');
      }
      console.log('[WsJwtGuard] Client.user', client.user);
      console.log('[WsJwtGuard] JWT_SECRET', process.env.JWT_SECRET);
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      console.log('[WsJwtGuard] payload:', payload);
      client.user = payload;
      return true;
    } catch (err) {
      throw new WsException('Invalid token!!!!');
    }
  }
}

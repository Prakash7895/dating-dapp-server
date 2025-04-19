import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDto } from './dto/auth.dto';
import { JwtPayload } from 'src/types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password!))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(authDto: AuthDto) {
    try {
      const { email, password } = authDto;

      const user = await this.validateUser(email, password);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const payload: JwtPayload = {
        email: user.email,
        userId: user.id,
        walletAddress: user.walletAddress,
      };

      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      const refreshToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const session = await this.prisma.session.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });

      if (session) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            refreshToken,
            refreshTokenExpires: expireTime,
          },
        });
      } else {
        await this.prisma.session.create({
          data: {
            refreshToken,
            refreshTokenExpires: expireTime,
            userId: user.id,
          },
        });
      }

      return {
        status: 'success',
        message: 'Login successful',
        data: { access_token: accessToken, refresh_token: refreshToken },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Invalid credentials',
        error: error.message,
        status: 'error',
      });
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const session = await this.prisma.session.findFirst({
        where: { userId: payload.sub },
        include: {
          user: true,
        },
      });

      if (!session || session.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = { email: session.user.email, sub: session.user.id };

      const access_token = this.jwtService.sign(newPayload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      return {
        status: 'success',
        message: 'Refresh token successful',
        data: { access_token },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

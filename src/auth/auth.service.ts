import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDto, SessionResponse } from './dto/auth.dto';
import { JwtPayload } from 'src/types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
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
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
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
        where: { userId: payload.userId },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      if (!session || session.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload: JwtPayload = {
        email: session.user.email,
        userId: session.user.id,
        walletAddress: session.user.walletAddress,
        firstName: session.user.profile?.firstName ?? null,
        lastName: session.user.profile?.lastName ?? null,
      };

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

  async validateToken(
    user: JwtPayload,
  ): Promise<{ status: 'success' | 'error'; data: SessionResponse }> {
    try {
      if (!user) {
        return {
          status: 'error',
          data: {
            user: null,
            expires: new Date(),
          },
        };
      }

      const savedUser = await this.prisma.user.findFirst({
        where: { id: user.userId },
        include: { profile: true },
      });

      if (!savedUser) {
        return {
          status: 'error',
          data: {
            user: null,
            expires: new Date(),
          },
        };
      }

      return {
        status: 'success',
        data: {
          user: {
            userId: savedUser.id,
            email: savedUser.email,
            walletAddress: savedUser.walletAddress,
            firstName: savedUser.profile?.firstName ?? null,
            lastName: savedUser.profile?.lastName ?? null,
          },
          expires: new Date(),
        },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to get session',
        error: error.message,
        status: 'error',
      });
    }
  }

  async logout(user: JwtPayload) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: { userId: user.userId },
      });
      if (sessions.length) {
        await this.prisma.session.deleteMany({
          where: { id: { in: sessions.map((el) => el.id) } },
        });
      }

      return {
        status: 'success',
        message: 'Logged out successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Invalid credentials',
        error: error.message,
        status: 'error',
      });
    }
  }
}

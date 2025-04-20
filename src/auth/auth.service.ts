import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDto, SessionResponse, WalletAuthDto } from './dto/auth.dto';
import { JwtPayload } from 'src/types';
import { ethers } from 'ethers';
import { HelperService } from 'src/helper/helper.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private helperService: HelperService,
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

  async login(dto: AuthDto | WalletAuthDto) {
    const authDto = dto as AuthDto;
    const walletDto = dto as WalletAuthDto;

    if (authDto.email && authDto.password) {
      return this.loginWithEmail(authDto);
    }
    if (walletDto.signedMessage && walletDto.walletAddress) {
      return this.loginWithWallet(walletDto);
    }

    throw new BadRequestException('Invalid Data');
  }

  async loginWithWallet(walletAuthDto: WalletAuthDto) {
    try {
      const { walletAddress, signedMessage } = walletAuthDto;

      // Verify wallet address format
      if (!ethers.isAddress(walletAddress)) {
        throw new BadRequestException('Invalid wallet address');
      }

      const user = await this.prisma.user.findFirst({
        where: { walletAddress: walletAddress.toLowerCase() },
        include: { profile: true },
      });

      if (!user) {
        throw new BadRequestException('No user found, want to sign up?');
      }

      // Verify signature
      const message = `${process.env.WALLET_MESSAGE_TO_VERIFY}${walletAddress}`;
      const isValid = await this.helperService.verifyWalletSignature(
        walletAddress,
        signedMessage,
        message,
      );

      if (!isValid) {
        throw new UnauthorizedException('Invalid signature');
      }

      const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
      };

      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      const accessTokenExpireTime = new Date(Date.now() + 15 * 60 * 1000);

      const refreshToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refreshTokenExpireTime = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      );

      // Update or create session
      const session = await this.prisma.session.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });

      if (session) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            refreshToken,
            refreshTokenExpires: refreshTokenExpireTime,
          },
        });
      } else {
        await this.prisma.session.create({
          data: {
            refreshToken,
            refreshTokenExpires: refreshTokenExpireTime,
            userId: user.id,
          },
        });
      }

      return {
        status: 'success',
        message: 'Wallet login successful',
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Wallet authentication failed',
        message: error.message,
        status: 'error',
      });
    }
  }

  async loginWithEmail(authDto: AuthDto) {
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

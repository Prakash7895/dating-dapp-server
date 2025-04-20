import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, SessionResponse } from './dto/auth.dto';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';
import { RequestWithUser } from 'src/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: AuthDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(
    @Req() req: RequestWithUser,
  ): Promise<{ status: 'success' | 'error'; data: SessionResponse }> {
    return this.authService.validateToken(req.user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: RequestWithUser) {
    return this.authService.logout(req.user);
  }
}

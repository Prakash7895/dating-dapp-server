import { IsNotEmpty, IsString } from 'class-validator';
import { JwtPayload } from 'src/types';

export class AuthDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export interface SessionResponse {
  user: JwtPayload | null;
  expires: Date;
}

export class WalletAuthDto {
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  signedMessage: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  email: string;
}

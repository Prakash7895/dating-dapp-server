import { IsString } from 'class-validator';
import { JwtPayload } from 'src/types';

export class AuthDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}

export interface SessionResponse {
  user: JwtPayload | null;
  expires: Date;
}

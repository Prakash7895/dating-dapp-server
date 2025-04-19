import {
  IsString,
  IsNumber,
  IsEmail,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GENDER, SEXUAL_ORIENTATION } from 'src/types';

export class CreateUserDto {
  @IsNumber()
  @Type(() => Number)
  age: number;

  @IsString()
  lastName: string;

  @IsString()
  firstName: string;

  @IsEnum(GENDER)
  gender: GENDER;

  @IsEnum(SEXUAL_ORIENTATION)
  sexualOrientation: SEXUAL_ORIENTATION;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Match } from 'src/decorators/match/match.decorator';
import {
  FILE_ACCESS,
  GENDER,
  GENDER_PREFERENCES,
  SEXUAL_ORIENTATION,
} from 'src/types';
import { isAddress } from 'ethers';

export class UpdatePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,}$/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @Match('password', {
    message: 'Password and confirm password should be same.',
  })
  confirmPassword: string;
}

export class UpdateUserDto {
  @IsNumber()
  @Min(18, { message: 'Age should be above 18.' })
  @Max(50, { message: 'Age should be below 50.' })
  @Type(() => Number)
  age: number;

  @IsString()
  @MinLength(1, { message: 'Last Name is required' })
  lastName: string;

  @IsString()
  @MinLength(1, { message: 'First Name is required' })
  firstName: string;

  @IsEnum(GENDER, { message: 'Gender is required' })
  gender: GENDER;

  @IsEnum(SEXUAL_ORIENTATION, { message: 'Sexual orientation is required' })
  sexualOrientation: SEXUAL_ORIENTATION;

  @IsString()
  @MinLength(50, { message: 'Minimum 50 characters are required.' })
  @MaxLength(500, { message: 'Upto 500 characters are allowed.' })
  bio: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Atleast 1 interest is required.' })
  @ArrayMaxSize(15, { message: 'Upto 15 Interests are allowed.' })
  @IsString({ each: true })
  interests: string[];

  @IsString()
  @MinLength(1, { message: 'City is required' })
  @MaxLength(50, { message: 'Upto 50 characters are allowed.' })
  city: string;

  @IsString()
  @MinLength(1, { message: 'Country is required' })
  @MaxLength(30, { message: 'Upto 30 characters are allowed.' })
  country: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  maxDistance: number;

  @IsNumber()
  @Min(18)
  @Max(50)
  @Type(() => Number)
  minAge: number;

  @IsNumber()
  @Min(18)
  @Max(50)
  @Type(() => Number)
  maxAge: number;

  @IsEnum(GENDER_PREFERENCES, { message: 'Gender Preference is required' })
  genderPreference: GENDER_PREFERENCES;
}

export class UpdateEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail()
  email: string;
}

export class UpdateWalletAddressDto {
  @IsString()
  @IsNotEmpty({ message: 'Wallet address is required' })
  walletAddress: string;
}

export class UploadPhotoDto {
  @IsEnum(FILE_ACCESS, { message: 'File access is required' })
  @IsNotEmpty({ message: 'File access is required' })
  access: FILE_ACCESS;
}

import {
  Controller,
  Get,
  UseGuards,
  Req,
  Put,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  Query,
  Param,
  Delete,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';
import { RequestWithUser } from 'src/types';
import {
  EnableEmailLoginDto,
  UpdateEmailDto,
  UpdatePasswordDto,
  UpdateUserDto,
  UpdateWalletAddressDto,
  UploadPhotoDto,
} from './dto/profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaginationDto } from 'src/common.dto';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getCurrUser(@Req() req: RequestWithUser) {
    return this.profileService.getCurrUser(req.user);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  updateCurrUser(@Req() req: RequestWithUser, @Body() body: UpdateUserDto) {
    return this.profileService.updateCurrUser(body, req.user);
  }

  @Put('/password')
  @UseGuards(JwtAuthGuard)
  updateCurrUserPassword(
    @Req() req: RequestWithUser,
    @Body() body: UpdatePasswordDto,
  ) {
    return this.profileService.updateCurrUserPassword(body, req.user);
  }

  @Put('/picture')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  updateCurrUserProfilePicture(
    @Req() req: RequestWithUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpg|jpeg|png)$/,
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024, // 5MB
        })
        .build(),
    )
    file: Express.Multer.File,
  ) {
    return this.profileService.updateCurrUserProfilePicture(file, req.user);
  }

  @Put('/email')
  @UseGuards(JwtAuthGuard)
  updateCurrUserEmail(
    @Req() req: RequestWithUser,
    @Body() body: UpdateEmailDto,
  ) {
    return this.profileService.updateCurrUserEmail(body, req.user);
  }

  @Put('/check-wallet-address')
  @UseGuards(JwtAuthGuard)
  checkCurrUserAddress(
    @Req() req: RequestWithUser,
    @Body() body: UpdateWalletAddressDto,
  ) {
    return this.profileService.checkCurrUserAddress(body, req.user);
  }

  @Put('/wallet-address')
  @UseGuards(JwtAuthGuard)
  updateCurrUserAddress(
    @Req() req: RequestWithUser,
    @Body() body: UpdateWalletAddressDto,
  ) {
    return this.profileService.updateCurrUserWalletAddress(body, req.user);
  }

  @Get('/photos')
  @UseGuards(JwtAuthGuard)
  getCurrUserPhotos(
    @Req() req: RequestWithUser,
    @Query() query: PaginationDto,
  ) {
    return this.profileService.getCurrUserPhotos(req.user, query);
  }

  @Put('/photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  addCurrUserPhoto(
    @Req() req: RequestWithUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpg|jpeg|png)$/,
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024, // 5MB
        })
        .build(),
    )
    file: Express.Multer.File,
    @Body() body: UploadPhotoDto,
  ) {
    return this.profileService.addCurrUserPhoto(file, body, req.user);
  }

  @Delete('/photo/:fileId')
  @UseGuards(JwtAuthGuard)
  deleteCurrUserPhoto(
    @Req() req: RequestWithUser,
    @Param('fileId') fileId: string,
  ) {
    return this.profileService.deleteCurrUserPhoto(fileId, req.user);
  }

  @Put('/photo/:fileId')
  @UseGuards(JwtAuthGuard)
  updateCurrUserPhotoAccess(
    @Req() req: RequestWithUser,
    @Body() body: UploadPhotoDto,
    @Param('fileId') fileId: string,
  ) {
    return this.profileService.updateCurrUserPhotoAccess(
      fileId,
      body,
      req.user,
    );
  }

  @Put('/enable-email-login')
  @UseGuards(JwtAuthGuard)
  enableEmailLogin(
    @Req() req: RequestWithUser,
    @Body() body: EnableEmailLoginDto,
  ) {
    return this.profileService.enableEmailLogin(body, req.user);
  }
}

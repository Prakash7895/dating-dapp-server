import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtPayload } from 'src/types';
import { PrismaService } from 'src/prisma.service';
import {
  EnableEmailLoginDto,
  UpdateEmailDto,
  UpdatePasswordDto,
  UpdateUserDto,
  UpdateWalletAddressDto,
  UploadPhotoDto,
} from './dto/profile.dto';
import { HelperService } from 'src/helper/helper.service';
import { UploadService } from 'src/upload/upload.service';
import { isAddress } from 'ethers';
import { PaginationDto } from 'src/common.dto';

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private helperService: HelperService,
    private uploadService: UploadService,
  ) {}

  async getCurrUser(user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          profile: true,
          walletAddress: true,
          _count: {
            select: {
              Notification: {
                where: {
                  status: true,
                  read: false,
                },
              },
              Nfts: true,
            },
          },
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      // if (savedUser.profile?.profilePicture) {
      //   const profilePicture = await this.uploadService.getSignedUrl(
      //     savedUser.profile.profilePicture,
      //   );

      //   savedUser.profile.profilePicture = profilePicture;
      // }

      const unreadNotifications = savedUser._count.Notification;
      const { _count, ...userData } = savedUser;

      return {
        status: 'success',
        message: 'User found',
        data: {
          ...userData,
          unreadNotifications,
          isVerified: savedUser._count.Nfts > 0,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUser(data: UpdateUserDto, user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          walletAddress: true,
          profile: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const profile = await this.prisma.profile.update({
        where: { id: savedUser.profile?.id },
        data: {
          age: data.age,
          bio: data.bio,
          country: data.country,
          city: data.city,
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender,
          genderPreference: data.genderPreference,
          interests: data.interests,
          minAge: data.minAge,
          maxAge: data.maxAge,
          maxDistance: data.maxDistance,
          sexualOrientation: data.sexualOrientation,
        },
      });

      return {
        status: 'success',
        message: 'User found',
        data: { ...savedUser, profile },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUserPassword(data: UpdatePasswordDto, user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const hashedPassword = await this.helperService.hashPassword(
        data.password,
      );

      await this.prisma.user.update({
        where: { id: user.userId },
        data: {
          password: hashedPassword,
        },
      });

      return {
        status: 'success',
        message: 'Password updated successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUserProfilePicture(
    file: Express.Multer.File,
    user: JwtPayload,
  ) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          profile: true,
          walletAddress: true,
          email: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const fileKey = await this.uploadService.uploadFile(
        file,
        user.userId,
        'profilePicture',
      );

      const profile = await this.prisma.profile.update({
        where: { id: savedUser.profile?.id },
        data: {
          profilePicture: fileKey,
        },
      });

      if (savedUser.profile?.profilePicture) {
        await this.uploadService.deleteFile(savedUser.profile.profilePicture);
      }

      return {
        status: 'success',
        message: 'Profile picture updated successfully',
        data: { ...savedUser, profile },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to update profile picture',
        error: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUserEmail(data: UpdateEmailDto, user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          profile: true,
          walletAddress: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      if (savedUser.email) {
        throw new BadRequestException('Email already saved');
      }

      const emailExists = await this.prisma.user.findUnique({
        where: { email: data.email?.toLowerCase() },
      });
      if (emailExists) {
        throw new BadRequestException('Email already exists');
      }

      const hashedPassword = await this.helperService.hashPassword(
        data.password,
      );

      const updatedUser = await this.prisma.user.update({
        where: { id: user.userId },
        data: {
          email: data.email?.toLowerCase(),
          password: hashedPassword,
        },
      });

      return {
        status: 'success',
        message: 'Email updated successfully',
        data: { ...updatedUser, profile: savedUser.profile },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to add email',
        message: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUserWalletAddress(
    data: UpdateWalletAddressDto,
    user: JwtPayload,
  ) {
    try {
      if (isAddress(data.walletAddress) === false) {
        throw new BadRequestException('Invalid wallet address');
      }

      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          email: true,
          profile: true,
          walletAddress: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      if (savedUser.walletAddress) {
        throw new BadRequestException('Wallet address already saved');
      }

      const walletAddressExists = await this.prisma.user.findUnique({
        where: { walletAddress: data.walletAddress?.toLowerCase() },
      });
      if (walletAddressExists) {
        throw new BadRequestException('Cannot add this wallet address.');
      }

      await this.prisma.user.update({
        where: { id: user.userId },
        data: {
          walletAddress: data.walletAddress.toLowerCase(),
        },
      });

      return {
        status: 'success',
        message: 'Wallet address updated successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to get current user',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getCurrUserPhotos(user: JwtPayload, query: PaginationDto) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          email: true,
          profile: true,
          walletAddress: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const { pageNo, pageSize } = query;

      const size = pageSize ? pageSize : 10;
      const skip = (pageNo - 1) * size;
      const take = size;

      const photos = await this.prisma.userFile.findMany({
        where: { userId: user.userId },
        take,
        skip,
      });

      const signedUrls = await this.uploadService.getSignedUrls(
        photos.map((photo) => photo.s3Key),
      );

      const totalPhotos = await this.prisma.userFile.count({
        where: { userId: user.userId },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        status: 'success',
        message: 'Photos found',
        data: {
          data: photos.map((photo) => {
            const signedUrl = signedUrls.find(
              (url) => url.key === photo.s3Key,
            )?.signedUrl;

            return {
              access: photo.access,
              id: photo.id,
              updatedAt: photo.updatedAt,
              key: photo.s3Key,
              url: signedUrl,
            };
          }),
          total: totalPhotos,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to get current user',
        error: error.message,
        status: 'error',
      });
    }
  }

  async addCurrUserPhoto(
    file: Express.Multer.File,
    body: UploadPhotoDto,
    user: JwtPayload,
  ) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const fileKey = await this.uploadService.uploadFile(file, user.userId);

      await this.prisma.userFile.create({
        data: {
          userId: user.userId,
          s3Key: fileKey,
          access: body.access,
        },
      });

      return {
        status: 'success',
        message: 'Photo added successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to add photo',
        error: error.message,
        status: 'error',
      });
    }
  }

  async deleteCurrUserPhoto(fileId: string, user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const file = await this.prisma.userFile.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new BadRequestException('File not found');
      }

      await this.uploadService.deleteFile(file.s3Key);

      await this.prisma.userFile.delete({
        where: { id: fileId },
      });

      return {
        status: 'success',
        message: 'Photo deleted successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to delete photo',
        error: error.message,
        status: 'error',
      });
    }
  }

  async updateCurrUserPhotoAccess(
    fileId: string,
    body: UploadPhotoDto,
    user: JwtPayload,
  ) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      const file = await this.prisma.userFile.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new BadRequestException('File not found');
      }

      await this.prisma.userFile.update({
        where: { id: fileId },
        data: {
          access: body.access,
        },
      });

      return {
        status: 'success',
        message: 'Photo access updated successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'Failed to update photo access',
        error: error.message,
        status: 'error',
      });
    }
  }

  async checkCurrUserAddress(data: UpdateWalletAddressDto, user: JwtPayload) {
    try {
      if (isAddress(data.walletAddress) === false) {
        throw new BadRequestException('Invalid wallet address');
      }

      const existingUser = await this.prisma.user.findFirst({
        where: {
          walletAddress: data.walletAddress.toLowerCase(),
        },
      });

      if (existingUser) {
        throw new BadRequestException('Cannot add this wallet address');
      }

      return {
        status: 'success',
        message: 'Wallet address can be added',
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to get current user',
        message: error.message,
        status: 'error',
      });
    }
  }

  async enableEmailLogin(data: EnableEmailLoginDto, user: JwtPayload) {
    try {
      const savedUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          email: true,
          walletAddress: true,
        },
      });

      if (!savedUser) {
        throw new BadRequestException('User not found');
      }

      if (!savedUser.email) {
        throw new BadRequestException('Email not present');
      }

      await this.prisma.user.update({
        where: { id: user.userId },
        data: {
          emailOnlyLogin: data.enable,
        },
      });

      return {
        status: 'success',
        message: `Email only login ${data.enable ? 'activated' : 'de-activated'}.`,
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'Failed to get current user',
        message: error.message,
        status: 'error',
      });
    }
  }
}

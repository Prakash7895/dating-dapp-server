import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { PaginationDto } from 'src/common.dto';
import { FILE_ACCESS, JwtPayload } from 'src/types';
import { UploadService } from 'src/upload/upload.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private helperService: HelperService,
    private uploadService: UploadService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const { email, walletAddress, signature, password } = createUserDto;

      if (!email && !walletAddress) {
        throw new BadRequestException(
          'Either email or wallet address is required',
        );
      }

      if (email) {
        const existingUserByEmail = await this.prisma.user.findUnique({
          where: { email },
        });
        if (existingUserByEmail) {
          throw new Error('User with this email already exists');
        }
      }

      if (walletAddress) {
        const existingUserByAddress = await this.prisma.user.findUnique({
          where: { walletAddress: walletAddress },
        });

        if (existingUserByAddress) {
          throw new Error('User with this wallet address already exists');
        }

        if (!signature) {
          throw new Error('Wallet signature is required');
        }

        if (signature) {
          const message = `${process.env.WALLET_MESSAGE_TO_VERIFY}${walletAddress}`;
          const isValid = await this.helperService.verifyWalletSignature(
            walletAddress,
            signature,
            message,
          );

          if (!isValid) {
            throw new BadRequestException('Invalid wallet signature');
          }
        }
      }

      // Create user data object
      const userData: CreateUserDto = {
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        age: +createUserDto.age,
        gender: createUserDto.gender,
        sexualOrientation: createUserDto.sexualOrientation,
        latitude: createUserDto.latitude,
        longitude: createUserDto.longitude,
      };

      // Add email and password if provided
      if (email && password) {
        const hashedPassword = await this.helperService.hashPassword(password);
        userData.email = email;
        userData.password = hashedPassword;
      }

      // Add wallet address if provided
      if (walletAddress) {
        userData.walletAddress = walletAddress;
      }

      // Create user in database
      const user = await this.prisma.user.create({
        data: {
          email: userData.email,
          password: userData.password,
          walletAddress: userData.walletAddress,
          profile: {
            create: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              age: userData.age,
              gender: userData.gender,
              sexualOrientation: userData.sexualOrientation,
              latitude: userData.latitude,
              longitude: userData.longitude,
            },
          },
        },
      });

      return {
        status: 'success',
        message: 'User created successfully',
        data: user,
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'User creation failed',
        error: error.message,
        status: 'error',
      });
    }
  }

  async findAll(user: JwtPayload, query: PaginationDto) {
    try {
      const { pageNo, pageSize } = query;

      const take = pageSize || 10;
      const skip = pageNo ? (pageNo - 1) * take : 0;

      const currUser = await this.prisma.user.findUnique({
        where: {
          id: user.userId,
        },
      });

      const likedUsers = await this.prisma.likes.findMany({
        where: {
          likerAddress: currUser?.walletAddress || undefined,
        },
        select: {
          targetAddress: true,
        },
      });

      const likedAddresses =
        likedUsers?.map((user) => user.targetAddress) ?? [];

      const whereQuery = {
        AND: [
          { id: { not: user.userId } },
          {
            walletAddress: { not: currUser?.walletAddress || undefined },
          },
          {
            walletAddress: { notIn: likedAddresses },
          },
        ],
      };

      const users = await this.prisma.user.findMany({
        where: whereQuery,
        skip,
        take,
        select: {
          id: true,
          email: true,
          lastActiveOn: true,
          walletAddress: true,
          profile: true,
          files: {
            where: {
              access: FILE_ACCESS.PUBLIC,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
            select: {
              s3Key: true,
            },
          },
        },
      });

      for (const user of users) {
        const files = user.files.map((file) => file.s3Key);

        const signedUrls = await this.uploadService.getSignedUrls(files);

        user.files = signedUrls.map((file) => file.signedUrl) as any;

        if (user.profile?.profilePicture) {
          user.profile.profilePicture = await this.uploadService.getSignedUrl(
            user.profile.profilePicture,
          );
        }
      }

      const totalUsers = await this.prisma.user.count({
        where: whereQuery,
      });

      return {
        status: 'success',
        message: 'Users retrieved successfully',
        data: { users, total: totalUsers },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'User retrieval failed',
        error: error.message,
        status: 'error',
      });
    }
  }

  async findLikedUsers(user: JwtPayload, query: PaginationDto) {
    try {
      const { pageNo, pageSize } = query;

      const take = pageSize || 10;
      const skip = pageNo ? (pageNo - 1) * take : 0;

      const currUser = await this.prisma.user.findUnique({
        where: {
          id: user.userId,
        },
      });

      if (!currUser?.walletAddress) {
        throw new BadRequestException('User wallet address not found');
      }

      const whereQuery = {
        likerAddress: currUser.walletAddress,
        status: true,
      };

      const likedUsers = await this.prisma.likes.findMany({
        where: whereQuery,
        select: {
          targetAddress: true,
          createdAt: true,
          target: {
            select: {
              id: true,
              email: true,
              walletAddress: true,
              lastActiveOn: true,
              profile: true,
              files: true,
            },
          },
        },
        skip,
        take,
      });

      for (const l of likedUsers) {
        const user = l.target;
        const files = user.files.map((file) => file.s3Key);

        const signedUrls = await this.uploadService.getSignedUrls(files);

        user.files = signedUrls.map((file) => file.signedUrl) as any;

        if (user.profile?.profilePicture) {
          user.profile.profilePicture = await this.uploadService.getSignedUrl(
            user.profile.profilePicture,
          );
        }
      }

      const totalLikedUsers = await this.prisma.likes.count({
        where: whereQuery,
      });

      return {
        status: 'success',
        message: 'Liked users retrieved successfully',
        data: {
          users: likedUsers.map((l) => ({ ...l.target, likedAt: l.createdAt })),
          total: totalLikedUsers,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'User retrieval failed',
        error: error.message,
        status: 'error',
      });
    }
  }

  async findMatchedUsers(user: JwtPayload, query: PaginationDto) {
    try {
      const { pageNo, pageSize } = query;

      const take = pageSize || 10;
      const skip = pageNo ? (pageNo - 1) * take : 0;

      const currUser = await this.prisma.user.findUnique({
        where: {
          id: user.userId,
        },
      });

      if (!currUser?.walletAddress) {
        throw new BadRequestException('User wallet address not found');
      }

      const whereQuery = {
        OR: [
          {
            addressA: currUser.walletAddress,
          },
          {
            addressB: currUser.walletAddress,
          },
        ],
      };

      const matchedUsers = await this.prisma.matches.findMany({
        where: whereQuery,
        select: {
          createdAt: true,
          addressA: true,
          addressB: true,
          userA: {
            include: {
              profile: true,
              files: true,
            },
          },
          userB: {
            include: {
              profile: true,
              files: true,
            },
          },
        },
        skip,
        take,
      });

      const totalMatchedUsers = await this.prisma.matches.count({
        where: whereQuery,
      });

      for (const l of matchedUsers) {
        const user = l.addressA === currUser.walletAddress ? l.userB : l.userA;

        const files = user.files.map((file) => file.s3Key);

        const signedUrls = await this.uploadService.getSignedUrls(files);

        user.files = signedUrls.map((file) => file.signedUrl) as any;

        if (user.profile?.profilePicture) {
          user.profile.profilePicture = await this.uploadService.getSignedUrl(
            user.profile.profilePicture,
          );
        }
      }

      return {
        status: 'success',
        message: 'Matched users retrieved successfully',
        data: matchedUsers.map((l) => ({
          ...(l.addressA === currUser.walletAddress ? l.userB : l.userA),
          matchedAt: l.createdAt,
        })),
        total: totalMatchedUsers,
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'User retrieval failed',
        error: error.message,
        status: 'error',
      });
    }
  }
}

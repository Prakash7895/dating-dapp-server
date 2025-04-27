import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AddressDto,
  CreateUserDto,
  GetMultiSigWalletDto,
} from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { PaginationDto } from 'src/common.dto';
import { FILE_ACCESS, JwtPayload } from 'src/types';
import { UploadService } from 'src/upload/upload.service';
import { isAddress } from 'ethers';
import { NotificationType } from 'src/notification/dto/nudge.dto';

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
          where: { walletAddress: walletAddress.toLowerCase() },
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
          email: userData.email?.toLowerCase(),
          password: userData.password,
          walletAddress: userData.walletAddress?.toLowerCase(),
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
        error: 'User creation failed',
        message: error.message,
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
          likerAddress: currUser?.walletAddress?.toLowerCase() || undefined,
        },
        select: {
          targetAddress: true,
        },
      });

      const likedAddresses =
        likedUsers?.map((user) => user.targetAddress?.toLowerCase()) ?? [];

      const whereQueryAnd: any[] = [{ id: { not: { equals: user.userId } } }];

      if (currUser?.walletAddress) {
        whereQueryAnd.push({
          OR: [
            {
              walletAddress: {
                not: { equals: currUser.walletAddress?.toLowerCase() },
              },
            },
            { walletAddress: null },
          ],
        });
      }
      if (likedAddresses.length) {
        whereQueryAnd.push({
          walletAddress: { notIn: likedAddresses },
        });
      }

      const users = await this.prisma.user.findMany({
        where: {
          AND: whereQueryAnd,
        },
        skip,
        take,
        select: {
          id: true,
          email: true,
          lastActiveOn: true,
          walletAddress: true,
          profile: true,
          Notification: {
            where: {
              nudgerId: user.userId,
              type: NotificationType.NUDGE,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
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
        where: { AND: whereQueryAnd },
      });

      return {
        status: 'success',
        message: 'Users retrieved successfully',
        data: {
          users: users.map((el) => {
            const { Notification, ...rest } = el;
            return {
              ...rest,
              nudgedAt: el.Notification?.[0]?.createdAt ?? null,
            };
          }),
          total: totalUsers,
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
        likerAddress: currUser.walletAddress?.toLowerCase(),
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
        error: 'User retrieval failed',
        message: error.message,
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
            addressA: currUser.walletAddress?.toLowerCase(),
          },
          {
            addressB: currUser.walletAddress?.toLowerCase(),
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
            select: {
              email: true,
              lastActiveOn: true,
              id: true,
              walletAddress: true,
              profile: true,
              files: true,
            },
          },
          userB: {
            select: {
              email: true,
              lastActiveOn: true,
              id: true,
              walletAddress: true,
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
        const user =
          l.addressA?.toLowerCase() === currUser.walletAddress?.toLowerCase()
            ? l.userB
            : l.userA;

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
        data: {
          users: matchedUsers.map((l) => ({
            ...(l.addressA?.toLowerCase() ===
            currUser.walletAddress?.toLowerCase()
              ? l.userB
              : l.userA),
            matchedAt: l.createdAt,
            addressA: l.addressA,
            addressB: l.addressB,
          })),
          total: totalMatchedUsers,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'User retrieval failed',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getMultiSigWallet(query: GetMultiSigWalletDto) {
    try {
      const { addressA, addressB } = query;

      if (!addressA || !addressB) {
        throw new Error('Addresses are required');
      }

      if (!isAddress(addressA)) {
        throw new Error('Address A is not valid wallet address');
      }

      if (!isAddress(addressB)) {
        throw new Error('Address B is not valid wallet address');
      }

      const address = await this.prisma.multiSigWallet.findFirst({
        where: {
          OR: [
            {
              AND: [{ addressA: addressA }, { addressB: addressB }],
            },
            {
              AND: [{ addressA: addressB }, { addressB: addressA }],
            },
          ],
        },
        include: {
          userA: {
            select: {
              walletAddress: true,
              email: true,
              id: true,
              profile: true,
            },
          },
          userB: {
            select: {
              walletAddress: true,
              email: true,
              id: true,
              profile: true,
            },
          },
        },
      });

      if (!address) {
        throw new Error('Wallet not found');
      }

      return {
        status: 'success',
        data: {
          ...address,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'failed getting multisig wallet',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getUserByAddress(query: AddressDto, user: JwtPayload) {
    try {
      const { address } = query;

      if (!address) {
        throw new Error('Addresses are required');
      }

      if (!isAddress(address)) {
        throw new Error('Address A is not valid wallet address');
      }

      const user = await this.prisma.user.findFirst({
        where: {
          walletAddress: address,
        },
        select: {
          id: true,
          email: true,
          lastActiveOn: true,
          profile: true,
          walletAddress: true,
          ownerAddressA: true,
          ownerAddressB: true,
        },
      });

      if (!user) {
        throw new Error('Wallet not found');
      }
      const { ownerAddressA, ownerAddressB, ...u } = user;
      const multiSigWallet = (ownerAddressA || ownerAddressB)?.[0];

      return {
        status: 'success',
        data: {
          ...u,
          multiSigWallet,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'failed getting user by address',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getMyMultiSigWallets(query: AddressDto) {
    try {
      const { address } = query;

      if (!address) {
        throw new Error('Address are required');
      }

      if (!isAddress(address)) {
        throw new Error('Address is not valid wallet address');
      }

      const addresses = await this.prisma.multiSigWallet.findMany({
        where: {
          OR: [
            {
              addressA: address,
            },
            {
              addressB: address,
            },
          ],
        },
        select: {
          walletAddress: true,
        },
      });

      return {
        status: 'success',
        data: {
          multiSigWallets: addresses?.map((el) => el.walletAddress) ?? [],
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: "failed getting user's multisig wallets",
        message: error.message,
        status: 'error',
      });
    }
  }
}

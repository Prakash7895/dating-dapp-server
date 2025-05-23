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
import { Prisma } from '@prisma/client';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private helperService: HelperService,
    private uploadService: UploadService,
    private emailService: EmailService,
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
          const message = `${process.env.WALLET_MESSAGE_TO_VERIFY}${walletAddress.toLowerCase()}`;
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

      if (user.email) {
        await this.emailService.sendSignUpEmail(
          user.email,
          `${userData?.firstName} ${userData?.lastName}`,
        );
      }

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

      let likedAddresses: string[] = [];

      if (currUser?.walletAddress) {
        const likedUsers = await this.prisma.likes.findMany({
          where: {
            likerAddress: {
              equals: currUser.walletAddress,
              mode: 'insensitive',
            },
            status: true,
          },
          select: {
            targetAddress: true,
          },
        });

        likedAddresses =
          likedUsers?.map((user) => user.targetAddress?.toLowerCase()) ?? [];
      }

      const whereQueryAnd: any[] = [{ id: { not: { equals: user.userId } } }];

      if (currUser?.walletAddress) {
        whereQueryAnd.push({
          OR: [
            {
              walletAddress: {
                not: currUser?.walletAddress,
                mode: 'insensitive',
              },
            },
            { walletAddress: null },
          ],
        });
      }
      if (likedAddresses.length) {
        whereQueryAnd.push({
          OR: [
            {
              walletAddress: { notIn: likedAddresses, mode: 'insensitive' },
            },
            {
              walletAddress: null,
            },
          ],
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
          _count: {
            select: {
              Nfts: true,
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

        (user as any).isVerified = !!user._count.Nfts;
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

      const whereQuery: Prisma.LikesWhereInput = {
        likerAddress: { equals: currUser.walletAddress, mode: 'insensitive' },
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
              files: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 3,
                select: {
                  s3Key: true,
                },
              },
              matchA: {
                where: {
                  OR: [
                    {
                      addressA: {
                        equals: currUser.walletAddress,
                        mode: 'insensitive',
                      },
                    },
                    {
                      addressB: {
                        equals: currUser.walletAddress,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
              matchB: {
                where: {
                  OR: [
                    {
                      addressA: {
                        equals: currUser.walletAddress,
                        mode: 'insensitive',
                      },
                    },
                    {
                      addressB: {
                        equals: currUser.walletAddress,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
              ChatRoomA: {
                where: {
                  OR: [{ userAId: currUser.id }, { userBId: currUser.id }],
                },
              },
              ChatRoomB: {
                where: {
                  OR: [{ userAId: currUser.id }, { userBId: currUser.id }],
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
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

        const matchA = user.matchA?.[0];
        const matchB = user.matchB?.[0];

        const matchAAddresses = [matchA?.addressA, matchA?.addressB]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();
        const matchBAddresses = [matchB?.addressA, matchB?.addressB]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();

        const currUserAddress = [currUser?.walletAddress, user?.walletAddress]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();

        if (
          matchAAddresses === currUserAddress ||
          matchBAddresses === currUserAddress
        ) {
          (user as any).isMatched = true;
        }

        const chatRoomA = user.ChatRoomA?.[0];
        const chatRoomB = user.ChatRoomB?.[0];
        const chatRoomAIds = [chatRoomA?.userAId, chatRoomA?.userBId]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();

        const chatRoomBIds = [chatRoomB?.userAId, chatRoomB?.userBId]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();
        const currUserIds = [currUser?.id, user?.id]
          .filter((e) => !!e)
          .sort()
          .join(',')
          .toLowerCase();

        if (chatRoomAIds === currUserIds) {
          (user as any).chatRoomId = chatRoomA.id;
        }

        if (chatRoomBIds === currUserIds) {
          (user as any).chatRoomId = chatRoomB.id;
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
            },
          },
          userB: {
            select: {
              email: true,
              lastActiveOn: true,
              id: true,
              walletAddress: true,
              profile: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const totalMatchedUsers = await this.prisma.matches.count({
        where: whereQuery,
      });

      for (const l of matchedUsers) {
        const user =
          l.addressA?.toLowerCase() === currUser.walletAddress?.toLowerCase()
            ? l.userB
            : l.userA;

        if (user.profile?.profilePicture) {
          user.profile.profilePicture = await this.uploadService.getSignedUrl(
            user.profile.profilePicture,
          );
        }
      }
      const users = matchedUsers.map((l) => ({
        ...(l.addressA?.toLowerCase() === currUser.walletAddress?.toLowerCase()
          ? l.userB
          : l.userA),
        matchedAt: l.createdAt,
        addressA: l.addressA,
        addressB: l.addressB,
        chatRoomId: '',
      }));

      const chatRooms = await this.prisma.chatRoom.findMany({
        where: {
          OR: [
            {
              userAId: currUser.id,
              userBId: { in: users.map((el) => el.id) },
            },
            {
              userAId: { in: users.map((el) => el.id) },
              userBId: currUser.id,
            },
          ],
        },
      });

      return {
        status: 'success',
        message: 'Matched users retrieved successfully',
        data: {
          users: users.map((u) => {
            const chatRoom = chatRooms.find(
              (el) =>
                (el.userAId === u.id && el.userBId === currUser.id) ||
                (el.userAId === currUser.id && el.userBId === u.id),
            );
            return {
              ...u,
              chatRoomId: chatRoom?.id,
            };
          }),
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

      const userAId = address.userA.id;
      const userBId = address.userB.id;

      let chatRoom = await this.prisma.chatRoom.findFirst({
        where: {
          OR: [
            {
              AND: [{ userAId: userAId }, { userBId: userBId }],
            },
            {
              AND: [{ userAId: userBId }, { userBId: userAId }],
            },
          ],
        },
      });

      if (!chatRoom) {
        chatRoom = await this.prisma.chatRoom.create({
          data: {
            userAId: userAId,
            userBId: userBId,
          },
        });
      }

      if (address.userA.profile?.profilePicture) {
        address.userA.profile.profilePicture =
          await this.uploadService.getSignedUrl(
            address.userA.profile.profilePicture,
          );
      }
      if (address.userB.profile?.profilePicture) {
        address.userB.profile.profilePicture =
          await this.uploadService.getSignedUrl(
            address.userB.profile.profilePicture,
          );
      }

      return {
        status: 'success',
        data: {
          ...address,
          chatRoomId: chatRoom.id,
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

  async getUserById(userId: string, _user: JwtPayload) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          id: true,
          email: true,
          lastActiveOn: true,
          profile: true,
          walletAddress: true,
          _count: {
            select: {
              Nfts: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('user not found');
      }

      let isMatched = false;
      if (_user.walletAddress && user.walletAddress) {
        const likes = await this.prisma.likes.findFirst({
          where: {
            likerAddress: _user.walletAddress,
            targetAddress: user.walletAddress,
          },
        });
        (user as any).likedAt = likes?.createdAt ?? null;

        const match = await this.prisma.matches.findFirst({
          where: {
            OR: [
              {
                addressA: { equals: _user.walletAddress, mode: 'insensitive' },
                addressB: { equals: user.walletAddress, mode: 'insensitive' },
              },
              {
                addressA: { equals: user.walletAddress, mode: 'insensitive' },
                addressB: { equals: _user.walletAddress, mode: 'insensitive' },
              },
            ],
          },
        });

        (user as any).matchedAt = match?.createdAt ?? null;

        if (match) {
          isMatched = true;
          const chatRoom = await this.prisma.chatRoom.findFirst({
            where: {
              OR: [
                { userAId: user.id, userBId: _user.userId },
                { userAId: _user.userId, userBId: user.id },
              ],
            },
          });
          (user as any).chatRoomId = chatRoom?.id;
        }
      }

      if (user.profile?.profilePicture) {
        user.profile.profilePicture = await this.uploadService.getSignedUrl(
          user.profile.profilePicture,
        );
      }

      return {
        status: 'success',
        data: {
          ...user,
          isVerified: !!user._count.Nfts,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'failed getting user by id',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getUserPhotos(
    userId: string,
    _user: JwtPayload,
    pagination: PaginationDto,
  ) {
    try {
      const currUser = await this.prisma.user.findUnique({
        where: {
          id: _user.userId,
        },
        select: {
          _count: {
            select: {
              Nfts: true,
            },
          },
        },
      });
      const isCurrUserVerified = !!currUser?._count.Nfts;

      if (!isCurrUserVerified) {
        throw new BadRequestException(
          'You are not allowed to view this user photos',
        );
      }

      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          walletAddress: true,
        },
      });

      if (!user) {
        throw new Error('user not found');
      }

      let isMatched = false;
      if (_user.walletAddress && user.walletAddress) {
        const match = await this.prisma.matches.findFirst({
          where: {
            OR: [
              {
                addressA: { equals: _user.walletAddress, mode: 'insensitive' },
                addressB: { equals: user.walletAddress, mode: 'insensitive' },
              },
              {
                addressA: { equals: user.walletAddress, mode: 'insensitive' },
                addressB: { equals: _user.walletAddress, mode: 'insensitive' },
              },
            ],
          },
        });
        if (match) {
          isMatched = true;
        }
      }

      const take = pagination.pageSize || 10;
      const skip = pagination.pageNo ? (pagination.pageNo - 1) * take : 0;

      const files = await this.prisma.userFile.findMany({
        where: {
          userId: userId,
          ...(!isMatched ? { access: FILE_ACCESS.PUBLIC } : {}),
        },
        take,
        skip,
        orderBy: {
          createdAt: 'desc',
        },
      });
      const fileUrls = files.map((file) => file.s3Key);
      const signedUrls = await this.uploadService.getSignedUrls(fileUrls);

      const fileData = signedUrls.map((f) => {
        const file = files.find((el) => el.s3Key === f.key);

        return {
          ...file,
          s3Key: f.signedUrl,
        };
      });

      return {
        status: 'success',
        data: fileData,
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'failed getting user photos by id',
        message: error.message,
        status: 'error',
      });
    }
  }

  async getUserNfts(
    userId: string,
    _user: JwtPayload,
    pagination: PaginationDto,
  ) {
    try {
      const currUser = await this.prisma.user.findUnique({
        where: {
          id: _user.userId,
        },
        select: {
          _count: {
            select: {
              Nfts: true,
            },
          },
        },
      });
      const isCurrUserVerified = !!currUser?._count.Nfts;

      if (!isCurrUserVerified) {
        throw new BadRequestException(
          'You are not allowed to view this user nfts',
        );
      }

      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          id: true,
          walletAddress: true,
        },
      });

      if (!user) {
        throw new Error('user not found');
      }

      if (!user.walletAddress) {
        return {
          status: 'success',
          data: [],
        };
      }

      const take = pagination.pageSize || 10;
      const skip = pagination.pageNo ? (pagination.pageNo - 1) * take : 0;

      const nfts = await this.prisma.nfts.findMany({
        where: {
          walletAddress: user.walletAddress,
        },
        take,
        skip,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        status: 'success',
        data: nfts,
      };
    } catch (error) {
      throw new BadRequestException({
        error: 'failed getting user nfts by id',
        message: error.message,
        status: 'error',
      });
    }
  }
}

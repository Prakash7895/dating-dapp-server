import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Contract, ethers, Interface, WebSocketProvider } from 'ethers';
import { PrismaService } from 'src/prisma.service';
import * as matchMakingAbi from 'src/abis/MatchMaking.json';
import * as soulboundNftAbi from 'src/abis/SoulboundNft.json';
import { WebSocketGateway } from 'src/web-socket/web-socket.gateway';
import { BlockEventName, ContractName } from 'src/types';

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private wsProvider: WebSocketProvider | null = null;
  private matchMakingContract: Contract | null = null;
  private soulboundNftContract: Contract | null = null;
  private isInitialized = false;

  constructor(
    private prisma: PrismaService,
    private wsGateway: WebSocketGateway,
  ) {}

  async onModuleInit() {
    console.log('Initializing BlockchainService...');
    await this.initializeWeb3Socket();
  }

  async onModuleDestroy() {
    await this.closeWeb3Socket();
  }

  private async setupMMEventListeners(contract: Contract) {
    // Remove any existing listeners
    await contract.removeAllListeners();

    // Like event listener
    await contract.on('Like', async (liker: string, target: string) => {
      console.log('📝 Like Event triggered');
      console.log('liker:', liker);
      console.log('target:', target);

      try {
        const existingLikes = await this.prisma.likes.findMany({
          where: {
            likerAddress: liker?.toLowerCase(),
            targetAddress: target?.toLowerCase(),
            status: true,
          },
        });
        if (existingLikes.length) {
          await this.prisma.likes.updateMany({
            where: { id: { in: existingLikes.map((like) => like.id) } },
            data: {
              status: false,
            },
          });
        }

        await this.prisma.likes.create({
          data: {
            likerAddress: liker?.toLowerCase(),
            targetAddress: target?.toLowerCase(),
            status: true,
          },
        });

        // const [likerUser, targetUser] = await Promise.all([
        //   this.prisma.user.findUnique({
        //     where: { walletAddress: liker.toLowerCase() },
        //   }),
        //   this.prisma.user.findUnique({
        //     where: { walletAddress: target.toLowerCase() },
        //   }),
        // ]);

        // if (likerUser && targetUser) {
        //   this.wsGateway.emitLikeEvent(likerUser.id, targetUser.id);
        // }

        console.log('✅ Like event stored in database');
      } catch (error) {
        console.error('❌ Error storing like event:', error);
      }
    });

    await contract.on('UnLike', async (liker: string, target: string) => {
      console.log('📝 UnLike Event triggered');
      console.log('liker:', liker);
      console.log('target:', target);

      try {
        const existingLikes = await this.prisma.likes.findMany({
          where: {
            likerAddress: liker?.toLowerCase(),
            targetAddress: target?.toLowerCase(),
            status: true,
          },
        });
        if (existingLikes.length) {
          await this.prisma.likes.updateMany({
            where: { id: { in: existingLikes.map((like) => like.id) } },
            data: {
              status: false,
            },
          });
        }

        console.log('✅ UnLike event stored in database');
      } catch (error) {
        console.error('❌ Error storing like event:', error);
      }
    });

    // Match event listener
    await contract.on('Match', async (userA: string, userB: string) => {
      console.log('💕 Match Event triggered');
      console.log('userA:', userA);
      console.log('userB:', userB);

      try {
        await this.prisma.matches.create({
          data: {
            addressA: userA?.toLowerCase(),
            addressB: userB?.toLowerCase(),
            status: true,
          },
        });

        // const [userAData, userBData] = await Promise.all([
        //   this.prisma.user.findUnique({
        //     where: { walletAddress: userA.toLowerCase() },
        //   }),
        //   this.prisma.user.findUnique({
        //     where: { walletAddress: userB.toLowerCase() },
        //   }),
        // ]);

        // if (userAData && userBData) {
        //   this.wsGateway.emitMatchEvent(userAData.id, userBData.id);
        // }

        console.log('✅ Match event stored in database');
      } catch (error) {
        console.error('❌ Error storing match event:', error);
      }
    });

    // MultiSigCreated event listener
    await contract.on(
      'MultiSigCreated',
      async (walletAddress: string, userA: string, userB: string) => {
        console.log('🔐 MultiSig Wallet Created Event triggered');
        console.log('walletAddress:', walletAddress);
        console.log('userA:', userA);
        console.log('userB:', userB);

        try {
          const users = await this.prisma.multiSigWallet.create({
            data: {
              addressA: userA?.toLowerCase(),
              addressB: userB?.toLowerCase(),
              walletAddress: walletAddress?.toLowerCase(),
            },
            select: {
              userA: {
                select: {
                  id: true,
                },
              },
              userB: {
                select: {
                  id: true,
                },
              },
            },
          });

          const userAId = users.userA.id;
          const userBId = users.userB.id;

          const chatRoomExists = await this.prisma.chatRoom.findFirst({
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

          if (!chatRoomExists) {
            await this.prisma.chatRoom.create({
              data: {
                userAId: userAId,
                userBId: userBId,
              },
            });
          }

          this.wsGateway.emitMatchEvent(
            userA?.toLowerCase(),
            userB?.toLowerCase(),
          );
          console.log('✅ MultiSig wallet event stored in database');
        } catch (error) {
          console.error('❌ Error storing multisig wallet event:', error);
        }
      },
    );

    // Log listener count for debugging
    const listenerCount = await contract.listenerCount();
    console.log(`✅ MM Total event listeners attached: ${listenerCount}`);
  }

  private async setupSNEventListeners(contract: Contract) {
    // Remove any existing listeners
    await contract.removeAllListeners();

    // Like event listener
    await contract.on(
      'ProfileMinted',
      async (user: string, tokenId: number, tokenUri: string) => {
        console.log('🎨 ProfileMinted Event triggered');
        console.log('user:', user);
        console.log('tokenId:', tokenId);
        console.log('tokenUri:', tokenUri);

        try {
          const existingNfts = await this.prisma.nfts.findMany({
            where: {
              walletAddress: { equals: user, mode: 'insensitive' },
              active: true,
            },
          });
          if (existingNfts.length) {
            await this.prisma.nfts.updateMany({
              where: { id: { in: existingNfts.map((el) => el.id) } },
              data: { active: false },
            });
          }
          await this.prisma.nfts.create({
            data: {
              walletAddress: user?.toLowerCase(),
              tokenId: Number(tokenId),
              tokenUri,
              active: true,
            },
          });

          console.log('✅ ProfileMinted event stored in database');
        } catch (error) {
          console.error('❌ Error storing ProfileMinted event:', error);
        }
      },
    );

    await contract.on(
      'ActiveNftChanged',
      async (user: string, tokenId: number) => {
        console.log('🔄 ActiveNftChanged Event triggered');
        console.log('user:', user);
        console.log('tokenId:', tokenId);

        try {
          await this.prisma.nfts.updateMany({
            where: { walletAddress: { equals: user, mode: 'insensitive' } },
            data: { active: false },
          });

          await this.prisma.nfts.update({
            where: {
              walletAddress: { equals: user, mode: 'insensitive' },
              tokenId: Number(tokenId),
            },
            data: { active: true },
          });

          console.log('✅ Active NFT updated in database');
        } catch (error) {
          console.error('❌ Error updating ActiveNftChanged event:', error);
        }
      },
    );

    // Log listener count for debugging
    const listenerCount = await contract.listenerCount();
    console.log(`✅ SN Total event listeners attached: ${listenerCount}`);
  }

  async getDeployedBlockNumberFromCode(
    provider: ethers.Provider,
    contractAddress: string,
  ) {
    try {
      let blockNumber = await provider.getBlockNumber(); // Get the latest block number
      let deployedBlock: number | null = null;

      // Binary search to find the block where the contract was deployed
      let high = blockNumber;
      let low = blockNumber > 10000 ? blockNumber - 10000 : 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const code = await provider.getCode(contractAddress, mid);
        console.log('Checking mid block', mid);
        if (code !== '0x') {
          deployedBlock = mid;
          high = mid - 1; // Search earlier blocks
        } else {
          low = mid + 1; // Search later blocks
        }
      }

      return deployedBlock;
    } catch (error) {
      console.log('Error fetching deployed block number from code:', error);
      return null;
    }
  }

  private async initializeWeb3Socket() {
    if (this.isInitialized) {
      console.log('Web3 socket already initialized');
      return;
    }
    const url = process.env.ALCHEMY_WEBSOCKET_URL;
    if (!url) {
      throw new Error('WebSocket URL not found in environment variables');
    }

    try {
      this.wsProvider = new WebSocketProvider(url);

      const contractAddress = process.env.MATCH_MAKING_ADDRESS!;
      const soulboundAddress = process.env.SOULBOUND_NFT_ADDRESS!;
      console.log('🔗 Connecting to MM contract at:', contractAddress);
      console.log('🔗 Connecting to SN contract at:', soulboundAddress);

      console.log('🔄 Initializing WebSocket connection...');

      const ifaceMM = new Interface(matchMakingAbi);
      const ifaceSN = new Interface(soulboundNftAbi);

      this.matchMakingContract = new ethers.Contract(
        contractAddress,
        ifaceMM,
        this.wsProvider,
      );

      this.soulboundNftContract = new ethers.Contract(
        soulboundAddress,
        ifaceSN,
        this.wsProvider,
      );

      const blocksExists = await this.prisma.blockTracker.count();
      if (blocksExists === 0) {
        const matchMackingBlock = await this.getDeployedBlockNumberFromCode(
          this.wsProvider,
          contractAddress,
        );

        const soulboundBlock = await this.getDeployedBlockNumberFromCode(
          this.wsProvider,
          soulboundAddress,
        );
        const dt: any[] = [];
        Object.keys(BlockEventName).forEach((cntr) =>
          dt.push(
            ...Object.keys(BlockEventName[cntr]).map((eventName) => ({
              contractName: cntr,
              eventName: eventName,
              lastBlockNumber:
                (cntr === ContractName.MatchMaking
                  ? matchMackingBlock
                  : soulboundBlock) ?? 0,
            })),
          ),
        );
        await this.prisma.blockTracker.createMany({
          data: dt,
        });
      }

      await this.syncWithBlockchain(
        this.wsProvider,
        this.matchMakingContract,
        this.soulboundNftContract,
      );

      const cnt = await this.matchMakingContract.listenerCount();
      console.log('CNT', cnt);

      await this.matchMakingContract.removeAllListeners();
      await this.soulboundNftContract.removeAllListeners();

      const cnt1 = await this.matchMakingContract.listenerCount();
      console.log('CNT1', cnt1);
      const listeners = await this.matchMakingContract.listeners();
      console.log('listeners', listeners);

      console.log('Attaching listeners...');
      await this.setupMMEventListeners(this.matchMakingContract);
      await this.setupSNEventListeners(this.soulboundNftContract);

      const cnt2 = await this.matchMakingContract.listenerCount();
      console.log('CNT2', cnt2);

      const listeners1 = await this.matchMakingContract.listeners();
      console.log('listeners1', listeners1);

      this.wsProvider.on('error', async (error) => {
        console.error('❌ WebSocket error:', error);
        this.isInitialized = false;
        await this.closeWeb3Socket();
      });

      this.isInitialized = true;

      console.log('✅ WebSocket connection initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket:', error);
      await this.closeWeb3Socket();
    }
  }

  private async closeWeb3Socket() {
    if (this.matchMakingContract) {
      await this.matchMakingContract.removeAllListeners();
      this.matchMakingContract = null;
    }

    if (this.soulboundNftContract) {
      await this.soulboundNftContract.removeAllListeners();
      this.soulboundNftContract = null;
    }

    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }

    this.isInitialized = false;
  }

  async syncWithBlockchain(
    provider: ethers.WebSocketProvider,
    matchMakingContract: Contract,
    soulboundNftContract: Contract,
  ) {
    try {
      const latestBlock = await provider?.getBlockNumber();
      console.log('Latest block number:', latestBlock);

      const blocksData = await this.prisma.blockTracker.findMany();

      const contractNames = Object.keys(BlockEventName);
      for (let i = 0; i < contractNames.length; i++) {
        const contractName = contractNames[i];

        const contract =
          contractName === ContractName.MatchMaking
            ? matchMakingContract
            : soulboundNftContract;

        const eventNames = Object.keys(BlockEventName[contractName]);
        for (let j = 0; j < eventNames.length; j++) {
          const eventName = eventNames[j];
          const blockData = blocksData.find(
            (b) => b.contractName === contractName && b.eventName === eventName,
          );

          const fromBlock = blockData?.lastBlockNumber || 0;

          await this.fetchPastEvents(
            contract,
            eventName,
            fromBlock,
            latestBlock,
          );
        }
      }
    } catch (error) {
      console.error('❌ Error syncing with blockchain:', error);
    }
  }

  private async fetchPastEvents(
    contract: Contract,
    eventName: string,
    fromBlock: number,
    toBlock: number,
  ) {
    try {
      const BATCH_SIZE = 500;
      for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE - 1, toBlock);

        console.log(
          `Fetching past events for ${eventName} from block ${start} to ${end}...`,
        );

        const events = await contract?.queryFilter(
          contract.filters[eventName](),
          start,
          end,
        );

        const eventsData = events
          .map((ev) => {
            const event = ev as ethers.EventLog;
            const blockNumber = event.blockNumber;
            console.log(`Processing past event: ${eventName}`, event.args);
            if (eventName === BlockEventName[ContractName.MatchMaking].Like) {
              return {
                event: eventName,
                liker: event.args.liker,
                target: event.args.target,
              };
            } else if (
              eventName === BlockEventName[ContractName.MatchMaking].UnLike
            ) {
              return {
                event: eventName,
                liker: event.args.liker,
                target: event.args.target,
              };
            } else if (
              eventName === BlockEventName[ContractName.MatchMaking].Match
            ) {
              return {
                event: eventName,
                userA: event.args.userA,
                userB: event.args.userB,
              };
            } else if (
              eventName ===
              BlockEventName[ContractName.MatchMaking].MultiSigCreated
            ) {
              return {
                event: eventName,
                walletAddress: event.args.walletAddress,
                userA: event.args.userA,
                userB: event.args.userB,
              };
            } else if (
              eventName ===
              BlockEventName[ContractName.SoulboundNft].ProfileMinted
            ) {
              return {
                event: eventName,
                user: event.args.user,
                tokenId: event.args.tokenId,
                tokenUri: event.args.tokenUri,
              };
            } else if (
              eventName ===
              BlockEventName[ContractName.SoulboundNft].ActiveNftChanged
            ) {
              return {
                event: eventName,
                user: event.args.user,
                tokenId: event.args.tokenId,
                blockNumber: blockNumber,
              };
            }
            return null;
          })
          .filter((e) => e !== null);

        await this.handleLikeEvent(
          eventsData.filter(
            (e) => e.event === BlockEventName[ContractName.MatchMaking].Like,
          ) as any,
          toBlock,
        );

        await this.handleUnLikeEvent(
          eventsData.filter(
            (e) => e.event === BlockEventName[ContractName.MatchMaking].UnLike,
          ) as any,
          toBlock,
        );

        await this.handleMatchEvent(
          eventsData.filter(
            (e) => e.event === BlockEventName[ContractName.MatchMaking].Match,
          ) as any,
          toBlock,
        );

        await this.handleMultiSigWalletEvent(
          eventsData.filter(
            (e) =>
              e.event ===
              BlockEventName[ContractName.MatchMaking].MultiSigCreated,
          ) as any,
          toBlock,
        );

        await this.handleProfileMintedEvent(
          eventsData.filter(
            (e) =>
              e.event ===
              BlockEventName[ContractName.SoulboundNft].ProfileMinted,
          ) as any,
          toBlock,
        );

        await this.handleActiveNftChangedEvent(
          eventsData.filter(
            (e) =>
              e.event ===
              BlockEventName[ContractName.SoulboundNft].ActiveNftChanged,
          ) as any,
          toBlock,
        );
      }
    } catch (error) {
      console.log(`❌ Error fetching past events for ${eventName}:`, error);
    }
  }

  async handleLikeEvent(
    data: { liker: string; target: string }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    await this.prisma.likes.createMany({
      data: data.map((like) => ({
        likerAddress: like.liker.toLowerCase(),
        targetAddress: like.target.toLowerCase(),
        status: true,
      })),
    });

    await this.updateBlockTracker(
      ContractName.MatchMaking,
      BlockEventName[ContractName.MatchMaking].Like,
      toBlock,
    );
  }

  async handleUnLikeEvent(
    data: { liker: string; target: string }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    const existingLikes = await this.prisma.likes.findMany({
      where: {
        OR: data.map((l) => ({
          AND: [
            { likerAddress: { contains: l.liker, mode: 'insensitive' } },
            { targetAddress: { contains: l.target, mode: 'insensitive' } },
          ],
        })),
        status: true,
      },
    });
    if (existingLikes.length) {
      await this.prisma.likes.updateMany({
        where: { id: { in: existingLikes.map((like) => like.id) } },
        data: {
          status: false,
        },
      });
    }
    await this.updateBlockTracker(
      ContractName.MatchMaking,
      BlockEventName[ContractName.MatchMaking].UnLike,
      toBlock,
    );
  }

  async handleMatchEvent(
    data: { userA: string; userB: string }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    await this.prisma.matches.createMany({
      data: data.map((user) => ({
        addressA: user.userA.toLowerCase(),
        addressB: user.userB.toLowerCase(),
        status: true,
      })),
    });

    await this.updateBlockTracker(
      ContractName.MatchMaking,
      BlockEventName[ContractName.MatchMaking].Match,
      toBlock,
    );
  }

  async handleMultiSigWalletEvent(
    data: { walletAddress: string; userA: string; userB: string }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    await this.prisma.multiSigWallet.createMany({
      data: data.map((d) => ({
        addressA: d.userA?.toLowerCase(),
        addressB: d.userB?.toLowerCase(),
        walletAddress: d.walletAddress?.toLowerCase(),
      })),
      skipDuplicates: true,
    });

    await this.updateBlockTracker(
      ContractName.MatchMaking,
      BlockEventName[ContractName.MatchMaking].MultiSigCreated,
      toBlock,
    );

    const users = await this.prisma.multiSigWallet.findMany({
      where: {
        OR: data.map((d) => ({
          AND: [
            { addressA: { contains: d.userA, mode: 'insensitive' } },
            { addressB: { contains: d.userB, mode: 'insensitive' } },
          ],
        })),
      },
      select: {
        userA: {
          select: {
            id: true,
          },
        },
        userB: {
          select: {
            id: true,
          },
        },
      },
    });

    const chatRooms = users.map((user) => ({
      userAId: user.userA.id,
      userBId: user.userB.id,
    }));

    const chatRoomsExists = await this.prisma.chatRoom.findMany({
      where: {
        OR: chatRooms.map((c) => ({
          OR: [
            {
              AND: [{ userAId: c.userAId }, { userBId: c.userBId }],
            },
            {
              AND: [{ userAId: c.userBId }, { userBId: c.userAId }],
            },
          ],
        })),
      },
    });

    const notExistingChat = chatRooms.filter(
      (c) =>
        !chatRoomsExists.some(
          (e) =>
            (e.userAId === c.userAId && e.userBId === c.userBId) ||
            (e.userBId === c.userAId && e.userAId === c.userBId),
        ),
    );

    if (notExistingChat.length) {
      await this.prisma.chatRoom.createMany({
        data: notExistingChat.map((d) => ({
          userAId: d.userAId,
          userBId: d.userBId,
        })),
        skipDuplicates: true,
      });
    }
  }

  async handleProfileMintedEvent(
    data: { user: string; tokenId: string; tokenUri: string }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    const existingNfts = await this.prisma.nfts.findMany({
      where: {
        walletAddress: {
          in: data.map((d) => d.user.toLowerCase()),
          mode: 'insensitive',
        },
        active: true,
      },
    });
    if (existingNfts.length) {
      await this.prisma.nfts.updateMany({
        where: { id: { in: existingNfts.map((el) => el.id) } },
        data: { active: false },
      });
    }
    await this.prisma.nfts.createMany({
      data: data.map((d, idx) => ({
        walletAddress: d.user?.toLowerCase(),
        tokenId: Number(d.tokenId),
        tokenUri: d.tokenUri,
        active: idx === data.length - 1 ? true : false,
      })),
    });

    await this.updateBlockTracker(
      ContractName.SoulboundNft,
      BlockEventName[ContractName.SoulboundNft].ProfileMinted,
      toBlock,
    );
  }

  async handleActiveNftChangedEvent(
    data: { user: string; tokenId: string; blockNumber: number }[],
    toBlock: number,
  ) {
    if (!data.length) {
      return;
    }

    const latestBlockNum = Math.max(...data.map((d) => d.blockNumber));

    const latestBlockData = data.find(
      (el) => el.blockNumber === latestBlockNum,
    );

    if (latestBlockData) {
      await this.prisma.nfts.update({
        where: {
          walletAddress: { equals: latestBlockData.user, mode: 'insensitive' },
          tokenId: Number(latestBlockData.tokenId),
        },
        data: { active: true },
      });
    }

    await this.updateBlockTracker(
      ContractName.SoulboundNft,
      BlockEventName[ContractName.SoulboundNft].ActiveNftChanged,
      toBlock,
    );
  }

  async updateBlockTracker(
    contractName: ContractName,
    eventName: string,
    blockNumber: number,
  ) {
    await this.prisma.blockTracker.upsert({
      where: {
        contractName_eventName: {
          contractName: contractName,
          eventName: eventName,
        },
      },
      create: {
        contractName: contractName,
        eventName: eventName,
        lastBlockNumber: blockNumber,
      },
      update: {
        lastBlockNumber: blockNumber,
      },
    });
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Contract, ethers, Interface, WebSocketProvider } from 'ethers';
import { PrismaService } from 'src/prisma.service';
import * as matchMakingAbi from 'src/abis/MatchMaking.json';

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private wsProvider: WebSocketProvider | null = null;
  private contract: Contract | null = null;
  private isInitialized = false;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    console.log('Initializing BlockchainService...');
    await this.initializeWeb3Socket();
  }

  async onModuleDestroy() {
    await this.closeWeb3Socket();
  }

  private async setupEventListeners(contract: Contract) {
    // Remove any existing listeners
    await contract.removeAllListeners();

    // Like event listener
    await contract.on('Like', async (liker: string, target: string) => {
      console.log('📝 Like Event triggered');
      console.log('liker:', liker);
      console.log('target:', target);

      try {
        await this.prisma.likes.create({
          data: {
            likerAddress: liker,
            targetAddress: target,
            status: true,
          },
        });
        console.log('✅ Like event stored in database');
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
            addressA: userA,
            addressB: userB,
            status: true,
          },
        });
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
          await this.prisma.multiSigWallet.create({
            data: {
              addressA: userA,
              addressB: userB,
              walletAddress: walletAddress,
            },
          });
          console.log('✅ MultiSig wallet event stored in database');
        } catch (error) {
          console.error('❌ Error storing multisig wallet event:', error);
        }
      },
    );

    // Log listener count for debugging
    const listenerCount = await contract.listenerCount();
    console.log(`✅ Total event listeners attached: ${listenerCount}`);
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
      console.log('contractAddress', contractAddress);

      console.log('🔄 Initializing WebSocket connection...');

      const iface = new Interface(matchMakingAbi);

      this.contract = new ethers.Contract(
        contractAddress,
        iface,
        this.wsProvider,
      );

      const cnt = await this.contract.listenerCount();
      console.log('CNT', cnt);

      await this.contract.removeAllListeners();

      const cnt1 = await this.contract.listenerCount();
      console.log('CNT1', cnt1);
      const listeners = await this.contract.listeners();
      console.log('listeners', listeners);

      console.log('Attaching listeners...');
      await this.setupEventListeners(this.contract);

      const cnt2 = await this.contract.listenerCount();
      console.log('CNT2', cnt2);

      const listeners1 = await this.contract.listeners();
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
    if (this.contract) {
      await this.contract.removeAllListeners();
      this.contract = null;
    }

    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }

    this.isInitialized = false;
  }
}

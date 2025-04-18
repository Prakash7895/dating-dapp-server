import { Contract, ethers, WebSocketProvider } from 'ethers';

import matchMakingAbi from './abis/MatchMaking.json';
import { query } from './db';

let wsProvider: WebSocketProvider | null = null;
let contract: Contract | null = null;
let isInitialized = false;

const setupEventListeners = async (contract: Contract) => {
  // Remove any existing listeners
  await contract.removeAllListeners();

  // Like event listener
  await contract.on('Like', async (liker: string, target: string) => {
    console.log('📝 Like Event triggered');
    console.log('liker:', liker);
    console.log('target:', target);

    try {
      await query(
        'INSERT INTO "Likes" ("likerAddress", "targetAddress", "status", "updatedAt") VALUES ($1, $2, $3, $4)',
        [liker, target, true, new Date().toISOString()]
      );
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
      await query(
        'INSERT INTO "Matches" ("addressA", "addressB", "status", "updatedAt") VALUES ($1, $2, $3, $4)',
        [userA, userB, true, new Date().toISOString()]
      );
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
        await query(
          'INSERT INTO "MultiSigWallet" ("addressA", "addressB", "walletAddress", "updatedAt") VALUES ($1, $2, $3, $4)',
          [userA, userB, walletAddress, new Date().toISOString()]
        );
        console.log('✅ MultiSig wallet event stored in database');
      } catch (error) {
        console.error('❌ Error storing multisig wallet event:', error);
      }
    }
  );

  // Log listener count for debugging
  const listenerCount = await contract.listenerCount();
  console.log(`✅ Total event listeners attached: ${listenerCount}`);
};

export const initializeWeb3Socket = async () => {
  console.log('isInitialized => ', isInitialized);
  if (isInitialized) {
    console.log('WebSocket connection already initialized');
    return;
  }

  const url = process.env.ALCHEMY_WEBSOCKET_URL;
  if (!url) {
    console.error('WebSocket URL not found in environment variables');
    return;
  }

  try {
    wsProvider = new WebSocketProvider(url);

    const contractAddress = process.env.MATCH_MAKING_ADDRESS!;
    console.log('contractAddress', contractAddress);

    console.log('🔄 Initializing WebSocket connection...');

    contract = new ethers.Contract(contractAddress, matchMakingAbi, wsProvider);

    const cnt = await contract.listenerCount();
    console.log('CNT', cnt);

    await contract.removeAllListeners();

    const cnt1 = await contract.listenerCount();
    console.log('CNT1', cnt1);
    const listeners = await contract.listeners();
    console.log('listeners', listeners);

    console.log('Attaching listeners...');
    await setupEventListeners(contract);

    const cnt2 = await contract.listenerCount();
    console.log('CNT2', cnt2);

    const listeners1 = await contract.listeners();
    console.log('listeners1', listeners1);

    wsProvider.on('error', async (error) => {
      console.error('❌ WebSocket error:', error);
      isInitialized = false;
      await closeWebSocket();
    });

    isInitialized = true;

    console.log('✅ WebSocket connection initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket:', error);
    await closeWebSocket();
  }
};

export const closeWebSocket = async () => {
  if (contract) {
    await contract.removeAllListeners();
    contract = null;
  }

  if (wsProvider) {
    wsProvider.destroy();
    wsProvider = null;
  }

  isInitialized = false;
  console.log('🔄 WebSocket connection closed and cleaned up');
};

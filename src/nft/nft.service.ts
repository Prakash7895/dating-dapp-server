import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { create } from '@web3-storage/w3up-client';
import { JwtPayload } from 'src/types';

@Injectable()
export class NftService implements OnModuleInit {
  private client: any;

  async onModuleInit() {
    await this.initializeWeb3Storage();
  }

  private async initializeWeb3Storage() {
    try {
      this.client = await create();
      const email = process.env.W3S_EMAIL;

      if (!email) {
        throw new Error('W3S_EMAIL environment variable is not set');
      }

      const allAccounts = this.client.accounts();

      if (!Object.keys(allAccounts).length) {
        const account = await this.client.login(email as `${string}@${string}`);
        const space = await this.client.createSpace('dating-dapp-space', {
          account,
        });
        await this.client.setCurrentSpace(space.did());
      }
    } catch (error) {
      console.error('Failed to initialize Web3.Storage:', error);
      throw error;
    }
  }

  private createNFTMetadataFile(imageCID: string, userId: string): Buffer {
    const metadata = {
      name: 'Profile NFT',
      description: 'A profile NFT stored on IPFS',
      image: `ipfs://${imageCID}`,
      image_gateway: `https://${imageCID}.ipfs.w3s.link`,
      userId,
    };

    return Buffer.from(JSON.stringify(metadata, null, 2));
  }

  async mintNft(file: Express.Multer.File, user: JwtPayload) {
    try {
      if (!this.client) {
        throw new Error('Web3.Storage client not initialized');
      }

      // Upload image file
      const imageBuffer = Buffer.from(file.buffer);
      const imageFile = new File([imageBuffer], file.originalname, {
        type: file.mimetype,
      });

      const uploadedFile = await this.client.uploadFile(imageFile);
      const imageCID = uploadedFile?.toString();

      // Create and upload metadata
      const metadataBuffer = this.createNFTMetadataFile(imageCID, user.userId);
      const metadataFile = new File([metadataBuffer], `${Date.now()}.json`, {
        type: 'application/json',
      });

      const uploadedMetadata = await this.client.uploadFile(metadataFile);
      const metadataCID = uploadedMetadata?.toString();

      return {
        status: 'success',
        message: 'NFT metadata uploaded successfully',
        data: {
          imageUrl: `https://${imageCID}.ipfs.w3s.link`,
          metadataUrl: `https://${metadataCID}.ipfs.w3s.link`,
          imageCID,
          metadataCID,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        status: 'error',
        message: 'Failed to mint NFT',
        error: error.message,
      });
    }
  }
}

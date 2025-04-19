import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { verifyMessage } from 'ethers';

@Injectable()
export class HelperService {
  async verifyWalletSignature(
    address: string,
    signature: string,
    message: string,
  ): Promise<boolean> {
    try {
      const recoveredAddress = verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.log('Signature verification failed:', error);
      return false;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, 10);
  }

  async verifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return compare(password, hashedPassword);
  }
}

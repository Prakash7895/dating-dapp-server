import { Request } from 'express';

export type JwtPayload = {
  userId: string;
  email: string | null;
  walletAddress: string | null;
  firstName: string | null;
  lastName: string | null;
};

export interface RequestWithUser extends Request {
  user: JwtPayload;
}

export enum GENDER {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum SEXUAL_ORIENTATION {
  STRAIGHT = 'STRAIGHT',
  GAY = 'GAY',
  LESBIAN = 'LESBIAN',
  BISEXUAL = 'BISEXUAL',
  PANSEXUAL = 'PANSEXUAL',
  ASEXUAL = 'ASEXUAL',
  OTHER = 'OTHER',
}

export enum GENDER_PREFERENCES {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  ALL = 'ALL',
}

export enum FILE_ACCESS {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}

export enum ContractName {
  MatchMaking = 'MatchMaking',
  SoulboundNft = 'SoulboundNft',
}

export const BlockEventName = {
  [ContractName.MatchMaking]: {
    Like: 'Like',
    UnLike: 'UnLike',
    Match: 'Match',
    MultiSigCreated: 'MultiSigCreated',
  },
  [ContractName.SoulboundNft]: {
    ProfileMinted: 'ProfileMinted',
    ActiveNftChanged: 'ActiveNftChanged',
  },
};

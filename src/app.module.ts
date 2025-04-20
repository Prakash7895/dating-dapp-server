import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { ProfileModule } from './profile/profile.module';
import { AuthModule } from './auth/auth.module';
import { HelperService } from './helper/helper.service';
import { UploadService } from './upload/upload.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { DocsModule } from './docs/docs.module';
import { NftModule } from './nft/nft.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UsersModule,
    ProfileModule,
    AuthModule,
    BlockchainModule,
    DocsModule,
    NftModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService, HelperService, UploadService],
})
export class AppModule {}

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

@Module({
  imports: [ConfigModule.forRoot(), UsersModule, ProfileModule, AuthModule],
  controllers: [AppController],
  providers: [AppService, PrismaService, HelperService, UploadService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { PrismaService } from 'src/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { UploadService } from 'src/upload/upload.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, PrismaService, HelperService, UploadService],
})
export class ProfileModule {}

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from 'src/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { UploadService } from 'src/upload/upload.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, HelperService, UploadService],
})
export class UsersModule {}

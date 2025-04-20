import { Module } from '@nestjs/common';
import { DocsService } from './docs.service';
import { DocsController } from './docs.controller';
import { UploadService } from 'src/upload/upload.service';

@Module({
  controllers: [DocsController],
  providers: [DocsService, UploadService],
})
export class DocsModule {}

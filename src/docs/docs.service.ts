import { BadRequestException, Injectable } from '@nestjs/common';
import { UploadService } from 'src/upload/upload.service';

@Injectable()
export class DocsService {
  constructor(private readonly uploadService: UploadService) {}

  async getSignedUrl(key: string) {
    try {
      const url = await this.uploadService.getSignedUrl(key);

      return {
        status: 'success',
        message: 'Signed URL generated successfully',
        data: url,
      };
    } catch (error) {
      throw new BadRequestException({
        status: 'error',
        message: 'Failed to generate signed URL',
        error: error.message,
      });
    }
  }
}

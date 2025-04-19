import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET!;
    this.s3Client = new S3Client({
      region: process.env.AWS_S3_REGION,
      credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_S3_SECRET_KEY!,
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    section: string = 'photos',
  ): Promise<string> {
    try {
      const key = `${userId}/${section}/${new Date().getTime()}-${file.originalname}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      return key;
    } catch (error) {
      throw new BadRequestException('Failed to upload file to S3');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      throw new BadRequestException('Failed to delete file from S3');
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      throw new BadRequestException('Failed to generate signed URL');
    }
  }

  async getSignedUrls(
    keys: string[],
    expiresIn: number = 3600,
  ): Promise<{ key: string; signedUrl: string }[]> {
    try {
      const signedUrls = await Promise.all(
        keys.map(async (key) => {
          const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
          });
          const signedUrl = await getSignedUrl(this.s3Client, command, {
            expiresIn,
          });

          return {
            key,
            signedUrl,
          };
        }),
      );
      return signedUrls;
    } catch (error) {
      throw new BadRequestException('Failed to generate signed URLs');
    }
  }
}

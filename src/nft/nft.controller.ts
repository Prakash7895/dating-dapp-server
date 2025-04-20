import {
  Controller,
  ParseFilePipeBuilder,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { NftService } from './nft.service';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequestWithUser } from 'src/types';

@Controller('nft')
export class NftController {
  constructor(private readonly nftService: NftService) {}

  @Post('/mint')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  mintNft(
    @Req() req: RequestWithUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpg|jpeg|png)$/,
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024, // 5MB
        })
        .build(),
    )
    file: Express.Multer.File,
  ) {
    return this.nftService.mintNft(file, req.user);
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DocsService } from './docs.service';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';

@Controller('docs')
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Get(':key')
  @UseGuards(JwtAuthGuard)
  getSignedUrl(@Param('key') key: string) {
    return this.docsService.getSignedUrl(key);
  }
}

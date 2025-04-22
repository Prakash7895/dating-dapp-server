import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  AddressDto,
  CreateUserDto,
  GetMultiSigWalletDto,
} from './dto/create-user.dto';
import { PaginationDto } from 'src/common.dto';
import { RequestWithUser } from 'src/types';
import { JwtAuthGuard } from 'src/jwt-auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: RequestWithUser, @Query() query: PaginationDto) {
    return this.usersService.findAll(req.user, query);
  }

  @Get('liked')
  @UseGuards(JwtAuthGuard)
  findLikedUsers(@Req() req: RequestWithUser, @Query() query: PaginationDto) {
    return this.usersService.findLikedUsers(req.user, query);
  }

  @Get('matched')
  @UseGuards(JwtAuthGuard)
  findMatchedUsers(@Req() req: RequestWithUser, @Query() query: PaginationDto) {
    return this.usersService.findMatchedUsers(req.user, query);
  }

  @Get('multi-sig-wallet/:addressA/:addressB')
  @UseGuards(JwtAuthGuard)
  getMultiSigWallet(@Param() param: GetMultiSigWalletDto) {
    return this.usersService.getMultiSigWallet(param);
  }

  @Get('by-address/:address')
  @UseGuards(JwtAuthGuard)
  getUser(@Param() param: AddressDto) {
    return this.usersService.getUserByAddress(param);
  }
}

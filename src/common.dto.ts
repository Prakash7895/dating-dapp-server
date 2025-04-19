import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsNumber()
  @Min(1, { message: 'Page number must be at least 1.' })
  @Type(() => Number)
  pageNo: number;

  @IsNumber()
  @Min(1, { message: 'Page size must be at least 1.' })
  @Max(100, { message: 'Page size must not exceed 100.' })
  @Type(() => Number)
  pageSize: number;
}

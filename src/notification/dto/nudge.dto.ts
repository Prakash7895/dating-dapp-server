import { IsString, IsUUID } from 'class-validator';

export class NudgeDto {
  @IsString()
  @IsUUID()
  userId: string;
}

export enum NotificationType {
  NUDGE = 'NUDGE',
}

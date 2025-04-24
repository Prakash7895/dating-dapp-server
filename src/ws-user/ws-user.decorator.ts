import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'src/types';

export const WsUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const client = ctx.switchToWs().getClient();
    return client.user;
  },
);

import { Controller, Post, UseGuards, Request, Get } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { LocalAuthGuard } from '../../session/passport/LocalAuth.guard';
import { SessionAuthGuard } from '../../session/passport/SessionAuth.guard';

export interface IUserInfo {
  loggedIn: boolean;
  email: string | null;
  username: string | null;
}

@Controller('user/session')
export class SessionController {
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req: ExpressRequest): Promise<IUserInfo> {
    return this.getUserInfo(req);
  }

  @UseGuards(SessionAuthGuard)
  @Get('info')
  async info(@Request() req: ExpressRequest): Promise<IUserInfo> {
    return this.getUserInfo(req);
  }

  private getUserInfo(req: ExpressRequest): IUserInfo {
    console.log(req);
    return {
      loggedIn: !!req.user,
      username: req.user?.username || null,
      email: req.user?.email || null,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('logout')
  async logout(@Request() req: ExpressRequest) {
    return new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) return reject(err);
        resolve('ok');
      });
    });
  }
}

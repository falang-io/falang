import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RequestResultDto } from '../../../system/dto/RequestResult.dto';
import { RegisterDto } from '../../registration/dto/Register.dto';
import { RegistrationService } from '../../registration/services/Registration.service';
import { ConfirmationDto } from '../../user/dto/Confirmation.dto';
import {
  ResetPasswordDto,
  ResetPasswordFinishDto,
} from '../../user/dto/User.dto';
import { UserService } from '../../user/services/User.service';

@Controller('user/registration')
export class UserRegistrationController {
  constructor(
    private registrations: RegistrationService,
    private users: UserService,
    private logger: PinoLogger,
  ) {
    this.logger.setContext(UserRegistrationController.name);
  }

  @Post('start')
  async start(@Body() data: RegisterDto) {
    await this.registrations.start(data);
    return { success: true };
  }

  @Post('activate')
  async activate(@Body() dto: ConfirmationDto): Promise<RequestResultDto> {
    try {
      await this.registrations.finish(dto.code);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  @Post('reset-password/start')
  async resetPasswordStart(
    @Body() dto: ResetPasswordDto,
  ): Promise<RequestResultDto> {
    await this.users.resetPasswordStart(dto);
    return { success: true };
  }

  @Post('reset-password/check-code')
  async resetPasswordCheckCode(
    @Body() dto: ConfirmationDto,
  ): Promise<RequestResultDto> {
    const result = await this.users.hasConfirmation(dto);
    return { success: result };
  }

  @Post('reset-password/finish')
  async resetPasswordFinish(
    @Body() dto: ResetPasswordFinishDto,
  ): Promise<RequestResultDto> {
    await this.users.resetPasswordFinish(dto);
    return { success: true };
  }
}

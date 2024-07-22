import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequestResultDto } from '../../../system/dto/RequestResult.dto';
import { AuthUser } from '../../session/decorators/AuthUser.decorator';
import { SessionAuthGuard } from '../../session/passport/SessionAuth.guard';
import { ChangePasswordDto } from '../../user/dto/User.dto';
import { UserService } from '../../user/services/User.service';

@Controller('user/profile')
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(private users: UserService) {}

  @Post('/change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @AuthUser('id') userId: number,
  ): Promise<RequestResultDto> {
    await this.users.changePassword(dto, userId);
    return { success: true };
  }
}

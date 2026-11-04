import { Controller, Get, Param } from '@nestjs/common';
import { AccessService } from '../auth/access.service';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { WalletService } from './wallet.service';

@Controller('students/:studentId/wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async balance(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    await this.access.assertCanAccessStudent(user, studentId);
    return { balanceCents: await this.wallet.balance(studentId) };
  }

  @Get('statement')
  async statement(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    await this.access.assertCanAccessStudent(user, studentId);
    return this.wallet.statement(studentId);
  }

  @Roles('ADMIN')
  @Get('audit')
  audit(@Param('studentId') studentId: string) {
    return this.wallet.recompute(studentId);
  }
}

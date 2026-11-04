import { Controller, Get, Param } from '@nestjs/common';
import { WalletService } from './wallet.service';

/** TODO(auth): responsável só vê os próprios filhos. */
@Controller('students/:studentId/wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  async balance(@Param('studentId') studentId: string) {
    return { balanceCents: await this.wallet.balance(studentId) };
  }

  @Get('statement')
  statement(@Param('studentId') studentId: string) {
    return this.wallet.statement(studentId);
  }

  @Get('audit')
  audit(@Param('studentId') studentId: string) {
    return this.wallet.recompute(studentId);
  }
}

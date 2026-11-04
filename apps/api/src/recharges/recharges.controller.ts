import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Min } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { RechargesService } from './recharges.service';

class CreatePixRechargeDto {
  @IsUUID()
  studentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents: number;
}

class CreateManualRechargeDto extends CreatePixRechargeDto {
  @IsString()
  @IsIn(['CASH', 'POS'])
  method: 'CASH' | 'POS';
}

@Controller('recharges')
export class RechargesController {
  constructor(private readonly recharges: RechargesService) {}

  /** Responsável gera um Pix para um filho (o vínculo é conferido no service). */
  @Roles('GUARDIAN')
  @Post('pix')
  createPix(@CurrentUser() user: AuthUser, @Body() dto: CreatePixRechargeDto, @Req() req: Request) {
    return this.recharges.createPix(user.id, dto.studentId, dto.amountCents, req.ip);
  }

  /** Recarga em dinheiro ou maquininha no balcão. */
  @Roles('ADMIN', 'OPERATOR')
  @Post('manual')
  createManual(@CurrentUser() user: AuthUser, @Body() dto: CreateManualRechargeDto) {
    return this.recharges.createManual(user.id, dto.studentId, dto.amountCents, dto.method);
  }

  @Roles('GUARDIAN')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.recharges.listForGuardian(user.id);
  }
}

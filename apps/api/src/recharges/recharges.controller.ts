import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Min } from 'class-validator';
import type { Request } from 'express';
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

/**
 * TODO(auth): trocar o header x-user-id pelo usuário do JWT
 * e restringir createManual a ADMIN/OPERATOR.
 */
@Controller('recharges')
export class RechargesController {
  constructor(private readonly recharges: RechargesService) {}

  @Post('pix')
  createPix(@Headers('x-user-id') guardianId: string, @Body() dto: CreatePixRechargeDto, @Req() req: Request) {
    return this.recharges.createPix(guardianId, dto.studentId, dto.amountCents, req.ip);
  }

  @Post('manual')
  createManual(@Headers('x-user-id') authorId: string, @Body() dto: CreateManualRechargeDto) {
    return this.recharges.createManual(authorId, dto.studentId, dto.amountCents, dto.method);
  }

  @Get('mine')
  mine(@Headers('x-user-id') guardianId: string) {
    return this.recharges.listForGuardian(guardianId);
  }
}

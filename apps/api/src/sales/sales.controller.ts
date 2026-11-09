import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { SalesService } from './sales.service';

class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

class CreateSaleDto {
  @IsUUID()
  studentId: string;

  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  @IsOptional()
  @IsUUID()
  offlineUuid?: string;

  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @ArrayMinSize(1)
  items: SaleItemDto[];
}

class RefundSaleDto {
  @IsString()
  @MinLength(3)
  reason: string;
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Roles('ADMIN', 'OPERATOR')
  @Get('identify/:code')
  identify(@Param('code') code: string) {
    return this.sales.identify(code);
  }

  /** Mesmo retorno do identify, a partir do id (aluno achado pela busca por nome). */
  @Roles('ADMIN', 'OPERATOR')
  @Get('checkout/:studentId')
  checkout(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.sales.checkoutContext(studentId);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get()
  listDay(@Query('date') date?: string) {
    return this.sales.listDay(date);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create({ ...dto, operatorId: user.id });
  }

  @Roles('ADMIN')
  @Post(':id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundSaleDto) {
    return this.sales.refund(id, user.id, dto.reason);
  }
}

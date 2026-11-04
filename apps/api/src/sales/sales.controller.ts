import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
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

/** TODO(auth): operador/admin vindos do JWT; refund só para ADMIN. */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('identify/:code')
  identify(@Param('code') code: string) {
    return this.sales.identify(code);
  }

  @Post()
  create(@Headers('x-user-id') operatorId: string, @Body() dto: CreateSaleDto) {
    return this.sales.create({ ...dto, operatorId });
  }

  @Post(':id/refund')
  refund(@Headers('x-user-id') adminId: string, @Param('id') id: string, @Body() dto: RefundSaleDto) {
    return this.sales.refund(id, adminId, dto.reason);
  }
}

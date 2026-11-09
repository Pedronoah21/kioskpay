import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsInt, IsString, IsUUID, Matches, Min, MinLength, ValidateNested } from 'class-validator';
import { AccessService } from '../auth/access.service';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { KioskService } from './kiosk.service';

class CardDto {
  @IsString()
  @MinLength(3)
  code: string;
}

class LoginDto extends CardDto {
  @Matches(/^\d{4}$/, { message: 'A senha tem 4 números.' })
  pin: string;
}

class ItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

class OrderDto {
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  @ArrayMinSize(1)
  items: ItemDto[];

  /** Gerado pelo totem; repetir o envio não duplica o pedido. */
  @IsUUID()
  key: string;
}

class PinDto {
  @IsString()
  pin: string;
}

class OrderStatusDto {
  @IsIn(['READY', 'DELIVERED'])
  status: 'READY' | 'DELIVERED';
}

/** Rotas usadas pelo aparelho do totem (perfil KIOSK). */
@Roles('KIOSK')
@Controller('kiosk')
export class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Post('card')
  @HttpCode(200)
  card(@Body() dto: CardDto) {
    return this.kiosk.card(dto.code);
  }

  @Post('login')
  @HttpCode(200)
  login(@CurrentUser() user: AuthUser, @Body() dto: LoginDto) {
    return this.kiosk.login(dto.code, dto.pin, user.id);
  }

  @Post('order')
  order(@CurrentUser() user: AuthUser, @Headers('x-kiosk-session') session: string, @Body() dto: OrderDto) {
    return this.kiosk.order(session, user.id, dto.items, dto.key);
  }
}

/** Fila de pedidos do totem, vista no balcão. */
@Roles('ADMIN', 'OPERATOR')
@Controller('orders')
export class OrdersController {
  constructor(private readonly kiosk: KioskService) {}

  @Get()
  queue() {
    return this.kiosk.queue();
  }

  @Patch(':id')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderStatusDto) {
    return this.kiosk.setOrderStatus(id, dto.status);
  }
}

/** Senha do totem: o responsável define para o filho; a escola também pode. */
@Roles('GUARDIAN', 'ADMIN')
@Controller('students/:studentId/controls/pin')
export class PinController {
  constructor(
    private readonly kiosk: KioskService,
    private readonly access: AccessService,
  ) {}

  @Put()
  async set(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: PinDto) {
    await this.access.assertCanAccessStudent(user, studentId);
    return this.kiosk.setPin(studentId, dto.pin);
  }

  @Delete()
  async remove(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    await this.access.assertCanAccessStudent(user, studentId);
    return this.kiosk.removePin(studentId);
  }
}

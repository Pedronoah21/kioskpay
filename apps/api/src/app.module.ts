import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './auth/access.service';
import { AuthController } from './auth/auth.controller';
import { HealthController } from './health.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { PAYMENT_GATEWAY } from './payments/payment-gateway';
import { PicPayGateway } from './payments/picpay/picpay.gateway';
import { PrismaModule } from './prisma/prisma.service';
import { RechargesController } from './recharges/recharges.controller';
import { RechargesService } from './recharges/recharges.service';
import { SalesController } from './sales/sales.controller';
import { SalesService } from './sales/sales.service';
import { CatalogController } from './catalog/catalog.controller';
import { KioskController, OrdersController, PinController } from './kiosk/kiosk.controller';
import { KioskService } from './kiosk/kiosk.service';
import { ControlsController } from './students/controls.controller';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { PaymentWebhookController } from './webhooks/payment-webhook.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    StudentsController,
    ControlsController,
    CatalogController,
    WalletController,
    RechargesController,
    SalesController,
    PaymentWebhookController,
    KioskController,
    OrdersController,
    PinController,
  ],
  providers: [
    // Toda rota exige login, salvo as marcadas com @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    AccessService,
    StudentsService,
    WalletService,
    RechargesService,
    SalesService,
    KioskService,
    PicPayGateway,
    {
      // Troque o provedor por variável de ambiente; novos adaptadores entram aqui
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, PicPayGateway],
      useFactory: (config: ConfigService, picpay: PicPayGateway) => {
        const name = config.get('PAYMENT_GATEWAY') ?? 'picpay';
        switch (name) {
          case 'picpay':
            return picpay;
          default:
            throw new Error(`Gateway de pagamento desconhecido: ${name}`);
        }
      },
    },
  ],
})
export class AppModule {}

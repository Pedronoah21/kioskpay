import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PAYMENT_GATEWAY } from './payments/payment-gateway';
import { PicPayGateway } from './payments/picpay/picpay.gateway';
import { PrismaModule } from './prisma/prisma.service';
import { RechargesController } from './recharges/recharges.controller';
import { RechargesService } from './recharges/recharges.service';
import { SalesController } from './sales/sales.controller';
import { SalesService } from './sales/sales.service';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { PaymentWebhookController } from './webhooks/payment-webhook.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [WalletController, RechargesController, SalesController, PaymentWebhookController],
  providers: [
    WalletService,
    RechargesService,
    SalesService,
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

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAYMENT_GATEWAY, PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RechargesService } from '../recharges/recharges.service';

/**
 * URL a cadastrar no Painel Lojista do PicPay (Ajustes > Meu checkout > URL de notificação):
 *   https://SEU_DOMINIO/webhooks/payments
 * Requisitos do PicPay: HTTPS, sem query string, sem IP.
 */
@Controller('webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recharges: RechargesService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Post('payments')
  @HttpCode(200)
  async handle(@Headers() headers: Record<string, string>, @Body() body: unknown) {
    if (!this.gateway.verifyWebhook(headers, body)) {
      throw new UnauthorizedException();
    }

    const event = this.gateway.parseWebhook(body);

    // Idempotência: evento já processado com sucesso é ignorado;
    // evento que falhou antes é reprocessado na retentativa do gateway.
    const key = { gateway: this.gateway.name, eventId: event.eventId };
    const stored = await this.prisma.webhookEvent.upsert({
      where: { gateway_eventId: key },
      update: {},
      create: { ...key, payload: body as Prisma.InputJsonValue },
    });
    if (stored.processedAt) return { ok: true, duplicate: true };

    try {
      // Confere o status direto na API antes de mexer em saldo
      const confirmed = event.status === 'PAID'
        ? await this.gateway.getChargeStatus(event.chargeId).catch(() => event.status)
        : event.status;

      const result = await this.recharges.applyStatus(event.chargeId, confirmed);
      await this.prisma.webhookEvent.update({
        where: { gateway_eventId: { gateway: this.gateway.name, eventId: event.eventId } },
        data: { processedAt: new Date() },
      });
      return { ok: true, result };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Webhook ${event.eventId}: ${message}`);
      await this.prisma.webhookEvent.update({
        where: { gateway_eventId: { gateway: this.gateway.name, eventId: event.eventId } },
        data: { error: message },
      });
      throw err; // responde erro para o gateway tentar de novo
    }
  }
}

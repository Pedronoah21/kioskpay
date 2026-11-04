import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NormalizedStatus, PAYMENT_GATEWAY, PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class RechargesService {
  private readonly logger = new Logger(RechargesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** Responsável pede uma recarga por Pix. O saldo só entra quando o webhook confirmar. */
  async createPix(guardianId: string, studentId: string, amountCents: number, clientIp?: string) {
    const min = Number(this.config.get('RECHARGE_MIN_CENTS') ?? 2000);
    if (!Number.isInteger(amountCents) || amountCents < min) {
      throw new BadRequestException(`Valor mínimo de recarga: R$ ${(min / 100).toFixed(2).replace('.', ',')}`);
    }

    const link = await this.prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId, studentId } },
      include: { guardian: true },
    });
    if (!link) throw new ForbiddenException('Aluno não vinculado a este responsável');
    const guardian = link.guardian;
    if (!guardian.document) throw new BadRequestException('Cadastre o CPF para recarregar');

    const chargeId = `rc-${randomUUID().replace(/-/g, '')}`; // 35 caracteres
    const recharge = await this.prisma.recharge.create({
      data: {
        chargeId,
        studentId,
        guardianId,
        amountCents,
        method: 'PIX',
        gateway: this.gateway.name,
      },
    });

    try {
      const pix = await this.gateway.createPixCharge({
        chargeId,
        amountCents,
        payer: { name: guardian.name, email: guardian.email, document: guardian.document },
        clientIp,
      });
      return this.prisma.recharge.update({
        where: { id: recharge.id },
        data: {
          gatewayRef: pix.gatewayRef,
          pixQrCode: pix.qrCode,
          pixQrCodeBase64: pix.qrCodeBase64,
          expiresAt: pix.expiresAt,
        },
      });
    } catch (err) {
      await this.prisma.recharge.update({ where: { id: recharge.id }, data: { status: 'CANCELED' } });
      this.logger.error(`Falha ao gerar Pix ${chargeId}: ${(err as Error).message}`);
      throw new BadRequestException('Não foi possível gerar o Pix. Tente novamente.');
    }
  }

  /** Recarga em dinheiro ou maquininha no balcão, lançada por admin/operador. */
  async createManual(authorId: string, studentId: string, amountCents: number, method: 'CASH' | 'POS') {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new BadRequestException('Valor inválido');
    return this.prisma.$transaction(async (tx) => {
      const recharge = await tx.recharge.create({
        data: {
          chargeId: `mn-${randomUUID().replace(/-/g, '')}`,
          studentId,
          amountCents,
          method,
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      await this.wallet.applyEntry(tx, {
        studentId,
        type: 'CREDIT',
        amountCents,
        originType: 'recharge',
        originId: recharge.id,
        authorId,
        reason: method === 'CASH' ? 'Recarga em dinheiro no balcão' : 'Recarga na maquininha',
      });
      return recharge;
    });
  }

  /**
   * Aplica uma mudança de status vinda do gateway. Idempotente:
   * cada transição só acontece a partir do status esperado.
   */
  async applyStatus(chargeId: string, status: NormalizedStatus) {
    const recharge = await this.prisma.recharge.findUnique({ where: { chargeId } });
    if (!recharge) throw new NotFoundException(`Recarga ${chargeId} não encontrada`);

    return this.prisma.$transaction(async (tx) => {
      if (status === 'PAID') {
        const moved = await tx.recharge.updateMany({
          where: { id: recharge.id, status: 'PENDING' },
          data: { status: 'PAID', paidAt: new Date() },
        });
        if (moved.count === 0) return 'ignored';
        await this.wallet.applyEntry(tx, {
          studentId: recharge.studentId,
          type: 'CREDIT',
          amountCents: recharge.amountCents,
          originType: 'recharge',
          originId: recharge.id,
          reason: 'Recarga Pix',
        });
        return 'credited';
      }

      if (status === 'CANCELED') {
        const moved = await tx.recharge.updateMany({
          where: { id: recharge.id, status: 'PENDING' },
          data: { status: 'CANCELED' },
        });
        return moved.count ? 'canceled' : 'ignored';
      }

      if (status === 'REFUNDED' || status === 'CHARGEBACK') {
        const moved = await tx.recharge.updateMany({
          where: { id: recharge.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        });
        if (moved.count === 0) return 'ignored';
        // Retira o valor; a carteira pode ficar negativa até regularizar
        await this.wallet.applyEntry(tx, {
          studentId: recharge.studentId,
          type: 'REVERSAL',
          amountCents: -recharge.amountCents,
          originType: 'recharge',
          originId: recharge.id,
          reason: status === 'CHARGEBACK' ? 'Chargeback da recarga' : 'Recarga estornada',
        });
        return 'reversed';
      }

      return 'ignored';
    });
  }

  listForGuardian(guardianId: string) {
    return this.prisma.recharge.findMany({
      where: { guardianId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

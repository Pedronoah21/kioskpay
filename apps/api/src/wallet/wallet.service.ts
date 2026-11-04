import { Injectable, NotFoundException } from '@nestjs/common';
import { EntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface EntryInput {
  studentId: string;
  type: EntryType;
  amountCents: number; // positivo entra, negativo sai
  originType: 'recharge' | 'sale' | 'manual';
  originId?: string;
  reason?: string;
  authorId?: string;
}

/**
 * Único lugar do sistema que altera saldo.
 * Sempre grava o lançamento e atualiza o cache na MESMA transação.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(studentId: string, tx: Tx = this.prisma) {
    return tx.wallet.upsert({
      where: { studentId },
      update: {},
      create: { studentId },
    });
  }

  /** Aplica um lançamento. Deve ser chamado dentro de uma transação. */
  async applyEntry(tx: Tx, input: EntryInput) {
    const wallet = await this.getOrCreate(input.studentId, tx);
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        type: input.type,
        amountCents: input.amountCents,
        originType: input.originType,
        originId: input.originId,
        reason: input.reason,
        authorId: input.authorId,
      },
    });
    return tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: { increment: input.amountCents } },
    });
  }

  async balance(studentId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { studentId } });
    return wallet?.balanceCents ?? 0;
  }

  async statement(studentId: string, take = 50) {
    const wallet = await this.prisma.wallet.findUnique({ where: { studentId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');
    return this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Recalcula o saldo pela soma dos lançamentos (auditoria). */
  async recompute(studentId: string) {
    const wallet = await this.getOrCreate(studentId);
    const sum = await this.prisma.ledgerEntry.aggregate({
      where: { walletId: wallet.id },
      _sum: { amountCents: true },
    });
    const real = sum._sum.amountCents ?? 0;
    return { cached: wallet.balanceCents, real, consistent: real === wallet.balanceCents };
  }
}

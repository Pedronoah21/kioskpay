import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CartItem, evaluateSale, rejectionMessage } from './sale-rules';

export interface SaleRequest {
  studentId: string;
  operatorId: string;
  cashboxId?: string;
  offlineUuid?: string;
  items: { productId: string; quantity: number }[];
}

/** Início do dia em America/Manaus (UTC-4, sem horário de verão). */
function startOfSchoolDay(now = new Date()): Date {
  const offsetMs = 4 * 60 * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMs);
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /** Identifica o aluno no caixa pelo QR code ou NFC (leitores às vezes mudam maiúsculas). */
  async identify(raw: string) {
    const code = raw.trim();
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ qrCode: code }, { qrCode: code.toUpperCase() }, { nfcUid: code }] },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Carteirinha não encontrada. Confira o código ou busque pelo nome.');
    return this.checkoutContext(student.id);
  }

  /**
   * Tudo que o caixa precisa para montar a venda: saldo, limite do dia,
   * quanto já gastou hoje e o que os pais bloquearam.
   * A validação definitiva continua no create().
   */
  async checkoutContext(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { wallet: true, classroom: true, restrictions: true },
    });
    if (!student) throw new NotFoundException('Aluno não encontrado');
    const spent = await this.prisma.sale.aggregate({
      where: { studentId, status: 'COMPLETED', createdAt: { gte: startOfSchoolDay() } },
      _sum: { totalCents: true },
    });
    return {
      id: student.id,
      name: student.name,
      enrollment: student.enrollment,
      photoUrl: student.photoUrl,
      classroom: student.classroom?.name ?? null,
      balanceCents: student.wallet?.balanceCents ?? 0,
      active: student.active,
      dailyLimitCents: student.dailyLimitCents,
      spentTodayCents: spent._sum.totalCents ?? 0,
      blockedProductIds: student.restrictions.flatMap((r) => (r.productId ? [r.productId] : [])),
      blockedCategoryIds: student.restrictions.flatMap((r) => (r.categoryId ? [r.categoryId] : [])),
    };
  }

  /** Vendas de um dia (padrão: hoje no horário de Manaus), mais recentes primeiro. */
  async listDay(date?: string) {
    let start = startOfSchoolDay();
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Data inválida (use AAAA-MM-DD)');
      start = new Date(`${date}T04:00:00.000Z`); // 00:00 em Manaus
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, name: true } },
        operator: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    const completed = sales.filter((s) => s.status === 'COMPLETED');
    return {
      date: start.toISOString(),
      count: completed.length,
      totalCents: completed.reduce((sum, s) => sum + s.totalCents, 0),
      sales: sales.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        status: s.status,
        totalCents: s.totalCents,
        student: s.student,
        operator: s.operator.name,
        items: s.items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
      })),
    };
  }

  async create(req: SaleRequest) {
    // Venda offline já sincronizada antes: devolve a existente
    if (req.offlineUuid) {
      const existing = await this.prisma.sale.findUnique({ where: { offlineUuid: req.offlineUuid } });
      if (existing) return existing;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: req.studentId },
          include: { wallet: true, restrictions: true },
        });
        if (!student) throw new NotFoundException('Aluno não encontrado');

        const products = await tx.product.findMany({
          where: { id: { in: req.items.map((i) => i.productId) } },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        const cart: CartItem[] = req.items.map((i) => {
          const p = byId.get(i.productId);
          if (!p) throw new BadRequestException(`Produto ${i.productId} não existe`);
          return {
            productId: p.id,
            categoryId: p.categoryId,
            name: p.name,
            unitPriceCents: p.priceCents,
            quantity: i.quantity,
            stock: p.stock,
            active: p.active,
          };
        });

        const spent = await tx.sale.aggregate({
          where: { studentId: student.id, status: 'COMPLETED', createdAt: { gte: startOfSchoolDay() } },
          _sum: { totalCents: true },
        });

        const verdict = evaluateSale(cart, {
          balanceCents: student.wallet?.balanceCents ?? 0,
          dailyLimitCents: student.dailyLimitCents,
          spentTodayCents: spent._sum.totalCents ?? 0,
          blockedProductIds: new Set(student.restrictions.flatMap((r) => (r.productId ? [r.productId] : []))),
          blockedCategoryIds: new Set(student.restrictions.flatMap((r) => (r.categoryId ? [r.categoryId] : []))),
          studentActive: student.active,
        });
        if (!verdict.ok) {
          throw new BadRequestException({ code: verdict.reason.code, message: rejectionMessage(verdict.reason) });
        }

        const sale = await tx.sale.create({
          data: {
            studentId: student.id,
            operatorId: req.operatorId,
            cashboxId: req.cashboxId,
            offlineUuid: req.offlineUuid,
            totalCents: verdict.totalCents,
            items: {
              create: cart.map((c) => ({
                productId: c.productId,
                quantity: c.quantity,
                unitPriceCents: c.unitPriceCents,
              })),
            },
          },
          include: { items: true },
        });

        for (const c of cart) {
          await tx.product.update({
            where: { id: c.productId },
            data: { stock: { decrement: c.quantity } },
          });
        }

        const wallet = await this.wallet.applyEntry(tx, {
          studentId: student.id,
          type: 'DEBIT',
          amountCents: -verdict.totalCents,
          originType: 'sale',
          originId: sale.id,
          authorId: req.operatorId,
        });

        // Proteção extra contra corrida entre dois caixas
        if (wallet.balanceCents < 0) throw new BadRequestException('Saldo insuficiente');

        return { ...sale, balanceAfterCents: wallet.balanceCents };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  /** Estorno de venda (somente admin): devolve o valor e o estoque. */
  async refund(saleId: string, adminId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.sale.updateMany({
        where: { id: saleId, status: 'COMPLETED' },
        data: { status: 'REFUNDED' },
      });
      if (moved.count === 0) throw new BadRequestException('Venda não encontrada ou já estornada');

      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: true } });
      for (const item of sale.items) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
      await this.wallet.applyEntry(tx, {
        studentId: sale.studentId,
        type: 'REFUND',
        amountCents: sale.totalCents,
        originType: 'sale',
        originId: sale.id,
        authorId: adminId,
        reason,
      });
      return sale;
    });
  }
}

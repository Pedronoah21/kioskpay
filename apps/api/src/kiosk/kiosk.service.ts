import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { afterFailure, pinProblem } from './pin';

/** Token curto que representa o aluno logado no totem (não vale como login de usuário). */
interface KioskSession {
  typ: 'kiosk-student';
  sub: string; // id do aluno
  kiosk: string; // id do usuário do totem
}

const SESSION_MINUTES = 5;

@Injectable()
export class KioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sales: SalesService,
  ) {}

  private async byCard(raw: string) {
    const code = raw.trim();
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ qrCode: code }, { qrCode: code.toUpperCase() }, { nfcUid: code }] },
    });
    if (!student) throw new NotFoundException('Carteirinha não reconhecida. Procure a cantina.');
    if (!student.active) throw new ForbiddenException('Carteirinha inativa. Procure a secretaria.');
    return student;
  }

  /** Passo 1: leu a carteirinha. Mostra só o primeiro nome e se já tem senha. */
  async card(code: string) {
    const s = await this.byCard(code);
    const lockedMinutes =
      s.pinLockedUntil && s.pinLockedUntil > new Date()
        ? Math.ceil((s.pinLockedUntil.getTime() - Date.now()) / 60_000)
        : 0;
    return { firstName: s.name.trim().split(/\s+/)[0], hasPin: !!s.pinHash, lockedMinutes };
  }

  /** Passo 2: carteirinha + senha. Devolve a sessão curta e os dados para montar o pedido. */
  async login(code: string, pin: string, kioskUserId: string) {
    const s = await this.byCard(code);
    if (!s.pinHash) {
      throw new ForbiddenException('Você ainda não tem senha. Peça aos seus pais para criar no app KioskPay.');
    }
    if (s.pinLockedUntil && s.pinLockedUntil > new Date()) {
      const min = Math.ceil((s.pinLockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`Muitas tentativas erradas. Tente de novo em ${min} min ou compre no balcão.`);
    }
    if (!(await bcrypt.compare(pin, s.pinHash))) {
      const r = afterFailure(s.pinFailures);
      await this.prisma.student.update({
        where: { id: s.id },
        data: { pinFailures: r.pinFailures, pinLockedUntil: r.pinLockedUntil },
      });
      // 400, não 401: um 401 faria o painel achar que o login do totem expirou
      throw new BadRequestException(
        r.locked
          ? 'Senha errada. Carteirinha bloqueada no totem por 15 minutos.'
          : `Senha errada. Você tem mais ${r.remaining} tentativa${r.remaining === 1 ? '' : 's'}.`,
      );
    }
    if (s.pinFailures || s.pinLockedUntil) {
      await this.prisma.student.update({ where: { id: s.id }, data: { pinFailures: 0, pinLockedUntil: null } });
    }
    const session: KioskSession = { typ: 'kiosk-student', sub: s.id, kiosk: kioskUserId };
    const token = await this.jwt.signAsync(session, { expiresIn: `${SESSION_MINUTES}m` });
    return { session: token, student: await this.sales.checkoutContext(s.id) };
  }

  /** Confere a sessão do aluno vinda do totem que a criou. */
  async readSession(token: string | undefined, kioskUserId: string): Promise<string> {
    if (!token) throw new ForbiddenException('Sessão do aluno ausente.');
    let payload: KioskSession;
    try {
      payload = await this.jwt.verifyAsync<KioskSession>(token);
    } catch {
      throw new BadRequestException({ code: 'SESSION_EXPIRED', message: 'Tempo esgotado. Passe a carteirinha de novo.' });
    }
    if (payload.typ !== 'kiosk-student' || payload.kiosk !== kioskUserId) {
      throw new ForbiddenException('Sessão inválida.');
    }
    return payload.sub;
  }

  async order(token: string | undefined, kioskUserId: string, items: { productId: string; quantity: number }[], key: string) {
    const studentId = await this.readSession(token, kioskUserId);
    const sale = await this.sales.create({
      studentId,
      operatorId: kioskUserId,
      offlineUuid: key,
      items,
      channel: 'KIOSK',
    });
    const balance =
      'balanceAfterCents' in sale
        ? sale.balanceAfterCents
        : (await this.sales.checkoutContext(studentId)).balanceCents;
    return { orderNumber: sale.orderNumber, totalCents: sale.totalCents, balanceAfterCents: balance };
  }

  // ---------- Senha (pais e escola) ----------
  async setPin(studentId: string, pin: string) {
    const problem = pinProblem(pin);
    if (problem) throw new BadRequestException(problem);
    const exists = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Aluno não encontrado');
    await this.prisma.student.update({
      where: { id: studentId },
      data: { pinHash: await bcrypt.hash(pin, 10), pinFailures: 0, pinLockedUntil: null },
    });
    return { ok: true };
  }

  async removePin(studentId: string) {
    await this.prisma.student.update({
      where: { id: studentId },
      data: { pinHash: null, pinFailures: 0, pinLockedUntil: null },
    });
    return { ok: true };
  }

  // ---------- Fila do balcão ----------
  async queue() {
    const since = new Date(Date.now() - 18 * 60 * 60 * 1000); // pedidos das últimas 18h
    const orders = await this.prisma.sale.findMany({
      where: {
        channel: 'KIOSK',
        status: 'COMPLETED',
        orderStatus: { in: ['PENDING', 'READY'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        student: { select: { name: true, classroom: { select: { name: true } } } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt,
      readyAt: o.readyAt,
      totalCents: o.totalCents,
      student: o.student.name,
      classroom: o.student.classroom?.name ?? null,
      items: o.items.map((i) => ({ name: i.product.name, quantity: i.quantity })),
    }));
  }

  async setOrderStatus(id: string, status: 'READY' | 'DELIVERED') {
    const from = status === 'READY' ? ['PENDING' as const] : ['PENDING' as const, 'READY' as const];
    const { count } = await this.prisma.sale.updateMany({
      where: { id, channel: 'KIOSK', status: 'COMPLETED', orderStatus: { in: from } },
      data: status === 'READY' ? { orderStatus: 'READY', readyAt: new Date() } : { orderStatus: 'DELIVERED', deliveredAt: new Date() },
    });
    if (!count) throw new BadRequestException('Pedido não encontrado ou já atualizado.');
    return { ok: true };
  }
}

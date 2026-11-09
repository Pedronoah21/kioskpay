import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/** Perfis criados pela escola (não se cadastram sozinhos). */
const STAFF_ROLES: Role[] = ['ADMIN', 'OPERATOR', 'KIOSK'];

/** Valida CPF pelos dígitos verificadores. */
export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export interface RegisterGuardianInput {
  name: string;
  email: string;
  password: string;
  document: string;
  phone?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private publicUser(u: User) {
    return { id: u.id, name: u.name, email: u.email, role: u.role };
  }

  private async issue(u: User) {
    const accessToken = await this.jwt.signAsync({ sub: u.id, role: u.role, name: u.name });
    return { accessToken, user: this.publicUser(u) };
  }

  /** Cadastro aberto apenas para responsáveis. */
  async registerGuardian(input: RegisterGuardianInput) {
    const document = input.document.replace(/\D/g, '');
    if (!isValidCpf(document)) throw new BadRequestException('CPF inválido');
    const email = input.email.trim().toLowerCase();

    const exists = await this.prisma.user.findFirst({ where: { OR: [{ email }, { document }] } });
    if (exists) throw new ConflictException('E-mail ou CPF já cadastrado');

    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        document,
        phone: input.phone,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: 'GUARDIAN',
      },
    });
    return this.issue(user);
  }

  /** Admin cria operadores e outros admins. */
  async createStaff(input: { name: string; email: string; password: string; role: Role }) {
    if (!STAFF_ROLES.includes(input.role)) {
      throw new BadRequestException('Perfil deve ser ADMIN, OPERATOR ou KIOSK');
    }
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: input.role,
      },
    });
    return this.publicUser(user);
  }

  listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async setStaffActive(currentId: string, id: string, active: boolean) {
    if (currentId === id && !active) throw new BadRequestException('Você não pode desativar o próprio acesso');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !STAFF_ROLES.includes(user.role)) {
      throw new BadRequestException('Usuário da equipe não encontrado');
    }
    return this.prisma.user.update({
      where: { id },
      data: { active },
      select: { id: true, name: true, active: true },
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Mesma mensagem para e-mail inexistente ou senha errada
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    return this.issue(user);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 10) } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { guardianOf: { include: { student: { include: { wallet: true, classroom: true } } } } },
    });
    return {
      ...this.publicUser(user),
      children: user.guardianOf.map(({ student: s }) => ({
        id: s.id,
        name: s.name,
        classroom: s.classroom?.name,
        photoUrl: s.photoUrl,
        balanceCents: s.wallet?.balanceCents ?? 0,
        dailyLimitCents: s.dailyLimitCents,
      })),
    };
  }
}

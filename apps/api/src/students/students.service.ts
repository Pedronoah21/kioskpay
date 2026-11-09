import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newStudentCode } from '../common/codes';
import { PrismaService } from '../prisma/prisma.service';
import { parseBrl, readStudentCsv } from './csv';

export interface StudentInput {
  name: string;
  enrollment: string;
  classroomId?: string | null;
  photoUrl?: string | null;
  nfcUid?: string | null;
  dailyLimitCents?: number | null;
  offlineLimitCents?: number;
  active?: boolean;
}

/** Remove o hash da senha do totem e informa só se existe. */
function publicStudent<T extends { pinHash?: string | null; pinFailures?: number; pinLockedUntil?: Date | null }>(s: T) {
  const { pinHash, pinFailures: _f, pinLockedUntil, ...rest } = s;
  return { ...rest, hasPin: !!pinHash, pinLocked: !!pinLockedUntil && pinLockedUntil > new Date() };
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(params: { search?: string; classroomId?: string; active?: boolean; skip?: number; take?: number }) {
    const where: Prisma.StudentWhereInput = {
      classroomId: params.classroomId,
      active: params.active,
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { enrollment: { contains: params.search } },
        ],
      }),
    };
    return this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        include: { classroom: true, wallet: true },
        orderBy: { name: 'asc' },
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 50, 200),
      }),
      this.prisma.student.count({ where }),
    ]).then(([items, total]) => ({ total, items: items.map(publicStudent) }));
  }

  async get(id: string) {
    const s = await this.prisma.student.findUnique({
      where: { id },
      include: {
        classroom: true,
        wallet: true,
        guardians: { include: { guardian: { select: { id: true, name: true, email: true, phone: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Aluno não encontrado');
    return publicStudent({ ...s, guardians: s.guardians.map((g) => g.guardian) });
  }

  private async uniqueCode(tx: Prisma.TransactionClient = this.prisma) {
    for (let i = 0; i < 5; i++) {
      const code = newStudentCode();
      if (!(await tx.student.findUnique({ where: { qrCode: code } }))) return code;
    }
    throw new Error('Não foi possível gerar um código único');
  }

  async create(input: StudentInput) {
    try {
      return publicStudent(await this.prisma.student.create({
        data: { ...input, qrCode: await this.uniqueCode(), wallet: { create: {} } },
        include: { classroom: true, wallet: true },
      }));
    } catch (e) {
      throw this.friendly(e);
    }
  }

  async update(id: string, input: Partial<StudentInput>) {
    try {
      return publicStudent(await this.prisma.student.update({ where: { id }, data: input, include: { classroom: true } }));
    } catch (e) {
      throw this.friendly(e);
    }
  }

  /** Carteirinha perdida: o código antigo deixa de funcionar na hora. */
  async regenerateCode(id: string) {
    return this.prisma.student.update({
      where: { id },
      data: { qrCode: await this.uniqueCode(), nfcUid: null },
      select: { id: true, name: true, qrCode: true },
    });
  }

  /**
   * Importa (ou atualiza, pela matrícula) alunos de um CSV.
   * Cria as turmas que ainda não existem. Linhas com erro são puladas e listadas.
   */
  async importCsv(text: string) {
    const parsed = readStudentCsv(text);
    let created = 0;
    let updated = 0;
    const classroomCache = new Map<string, string>();

    for (const row of parsed.rows) {
      let classroomId: string | undefined;
      if (row.classroom) {
        classroomId = classroomCache.get(row.classroom);
        if (!classroomId) {
          const existing = await this.prisma.classroom.findFirst({ where: { name: row.classroom } });
          const c =
            existing ??
            (await this.prisma.classroom.create({
              data: { name: row.classroom, grade: row.grade ?? row.classroom, shift: row.shift },
            }));
          classroomId = c.id;
          classroomCache.set(row.classroom, c.id);
        }
      }
      const data = {
        name: row.name,
        classroomId,
        ...(row.dailyLimit !== undefined && { dailyLimitCents: parseBrl(row.dailyLimit) }),
      };

      const existing = await this.prisma.student.findUnique({ where: { enrollment: row.enrollment } });
      if (existing) {
        await this.prisma.student.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.student.create({
          data: { ...data, enrollment: row.enrollment, qrCode: await this.uniqueCode(), wallet: { create: {} } },
        });
        created++;
      }
    }
    return { created, updated, skipped: parsed.errors.length, errors: parsed.errors };
  }

  async linkGuardian(studentId: string, email: string) {
    const guardian = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), role: 'GUARDIAN' } });
    if (!guardian) throw new NotFoundException('Responsável não encontrado. Peça para ele se cadastrar no app.');
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Aluno não encontrado');
    await this.prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId: guardian.id, studentId } },
      update: {},
      create: { guardianId: guardian.id, studentId },
    });
    return { ok: true, guardian: guardian.name, student: student.name };
  }

  async unlinkGuardian(studentId: string, guardianId: string) {
    await this.prisma.guardianStudent.deleteMany({ where: { studentId, guardianId } });
    return { ok: true };
  }

  private friendly(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const field = String((e.meta?.target as string[] | undefined)?.[0] ?? '');
        return new ConflictException(field === 'enrollment' ? 'Matrícula já cadastrada' : 'Código já em uso');
      }
      if (e.code === 'P2025') return new NotFoundException('Aluno não encontrado');
      if (e.code === 'P2003') return new BadRequestException('Turma não existe');
    }
    return e;
  }
}

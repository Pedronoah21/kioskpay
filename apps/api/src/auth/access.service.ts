import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.decorators';

/** Regras de quem pode ver/alterar dados de um aluno. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin e operador veem qualquer aluno; responsável só os próprios filhos. */
  async assertCanAccessStudent(user: AuthUser, studentId: string) {
    if (user.role === 'ADMIN' || user.role === 'OPERATOR') return;
    if (user.role === 'GUARDIAN') {
      const link = await this.prisma.guardianStudent.findUnique({
        where: { guardianId_studentId: { guardianId: user.id, studentId } },
      });
      if (link) return;
    }
    throw new ForbiddenException('Você não tem acesso a este aluno');
  }
}

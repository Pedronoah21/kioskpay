import { Body, Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class LinkGuardianDto {
  @IsEmail()
  email: string;
}

@Controller('students')
export class StudentsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin vincula um responsável já cadastrado a um aluno. */
  @Roles('ADMIN')
  @Post(':studentId/guardians')
  async linkGuardian(@Param('studentId') studentId: string, @Body() dto: LinkGuardianDto) {
    const guardian = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase(), role: 'GUARDIAN' },
    });
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
}

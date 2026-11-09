import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';
import { AccessService } from '../auth/access.service';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class DailyLimitDto {
  /** null remove o limite */
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  dailyLimitCents: number | null;
}

class RestrictionDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
}

/**
 * Controles do responsável sobre o filho: limite diário e bloqueios.
 * O admin também pode usar (ex.: pedido por telefone).
 */
@Roles('GUARDIAN', 'ADMIN')
@Controller('students/:studentId/controls')
export class ControlsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    await this.access.assertCanAccessStudent(user, studentId);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        dailyLimitCents: true,
        pinHash: true,
        pinLockedUntil: true,
        restrictions: { include: { product: true, category: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!student) throw new NotFoundException('Aluno não encontrado');
    return {
      studentId: student.id,
      name: student.name,
      dailyLimitCents: student.dailyLimitCents,
      hasPin: !!student.pinHash,
      pinLocked: !!student.pinLockedUntil && student.pinLockedUntil > new Date(),
      restrictions: student.restrictions.map((r) => ({
        id: r.id,
        type: r.productId ? 'product' : 'category',
        targetId: r.productId ?? r.categoryId,
        name: r.product?.name ?? r.category?.name,
      })),
    };
  }

  @Put('daily-limit')
  async setDailyLimit(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: DailyLimitDto) {
    await this.access.assertCanAccessStudent(user, studentId);
    return this.prisma.student.update({
      where: { id: studentId },
      data: { dailyLimitCents: dto.dailyLimitCents },
      select: { id: true, dailyLimitCents: true },
    });
  }

  @Post('restrictions')
  async block(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: RestrictionDto) {
    await this.access.assertCanAccessStudent(user, studentId);
    if (!!dto.productId === !!dto.categoryId) {
      throw new BadRequestException('Informe um produto OU uma categoria');
    }
    if (dto.productId && !(await this.prisma.product.findUnique({ where: { id: dto.productId } }))) {
      throw new NotFoundException('Produto não encontrado');
    }
    if (dto.categoryId && !(await this.prisma.category.findUnique({ where: { id: dto.categoryId } }))) {
      throw new NotFoundException('Categoria não encontrada');
    }
    const existing = await this.prisma.restriction.findFirst({
      where: { studentId, productId: dto.productId ?? null, categoryId: dto.categoryId ?? null },
    });
    return existing ?? this.prisma.restriction.create({ data: { studentId, ...dto } });
  }

  @Delete('restrictions/:restrictionId')
  async unblock(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Param('restrictionId') restrictionId: string,
  ) {
    await this.access.assertCanAccessStudent(user, studentId);
    const { count } = await this.prisma.restriction.deleteMany({ where: { id: restrictionId, studentId } });
    if (!count) throw new NotFoundException('Bloqueio não encontrado');
    return { ok: true };
  }
}

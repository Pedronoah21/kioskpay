import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class ClassroomDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) grade: string;
  @IsOptional() @IsString() shift?: string;
}

class CategoryDto {
  @IsString() @MinLength(2) name: string;
}

class ProductDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsInt() @Min(1) priceCents: number;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsInt() @Min(1) priceCents?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class StockDto {
  /** Entrada (positivo) ou saída/perda (negativo). */
  @IsInt() delta: number;
}

class ProductQuery {
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() lowStock?: boolean;
}

function conflict(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(message);
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException();
  throw e;
}

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Turmas ----------
  @Roles('ADMIN', 'OPERATOR')
  @Get('classrooms')
  classrooms() {
    return this.prisma.classroom.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });
  }

  @Roles('ADMIN')
  @Post('classrooms')
  createClassroom(@Body() dto: ClassroomDto) {
    return this.prisma.classroom.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch('classrooms/:id')
  updateClassroom(@Param('id') id: string, @Body() dto: ClassroomDto) {
    return this.prisma.classroom.update({ where: { id }, data: dto }).catch((e) => conflict(e, ''));
  }

  // ---------- Categorias ----------
  /** Todos os perfis: o responsável usa para escolher o que bloquear. */
  @Get('categories')
  categories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles('ADMIN')
  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.category.create({ data: dto }).catch((e) => conflict(e, 'Categoria já existe'));
  }

  // ---------- Produtos ----------
  /** Cardápio: todos os perfis veem os produtos ativos. */
  @Get('products')
  products(@Query() q: ProductQuery) {
    return this.prisma.product
      .findMany({ where: { active: true }, include: { category: true }, orderBy: { name: 'asc' } })
      .then((list) => (q.lowStock ? list.filter((p) => p.stock <= p.minStock) : list));
  }

  @Roles('ADMIN')
  @Post('products')
  createProduct(@Body() dto: ProductDto) {
    return this.prisma.product.create({ data: dto, include: { category: true } });
  }

  @Roles('ADMIN')
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto }).catch((e) => conflict(e, ''));
  }

  /** Entrada de mercadoria ou baixa por perda. */
  @Roles('ADMIN', 'OPERATOR')
  @Post('products/:id/stock')
  adjustStock(@Param('id') id: string, @Body() dto: StockDto) {
    return this.prisma.product
      .update({ where: { id }, data: { stock: { increment: dto.delta } }, select: { id: true, name: true, stock: true } })
      .catch((e) => conflict(e, ''));
  }

  @Roles('ADMIN')
  @Delete('products/:id')
  deactivateProduct(@Param('id') id: string) {
    return this.prisma.product.update({ where: { id }, data: { active: false } }).catch((e) => conflict(e, ''));
  }
}

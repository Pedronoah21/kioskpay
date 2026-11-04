import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { StudentsService } from './students.service';

class StudentDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  enrollment: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  nfcUid?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyLimitCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offlineLimitCents?: number;
}

class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() enrollment?: string;
  @IsOptional() @IsUUID() classroomId?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() nfcUid?: string;
  @IsOptional() @IsInt() @Min(0) dailyLimitCents?: number;
  @IsOptional() @IsInt() @Min(0) offlineLimitCents?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ListQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() classroomId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) take?: number;
}

class ImportDto {
  /** Conteúdo do arquivo CSV (o painel lê o arquivo e envia o texto). */
  @IsString()
  csv: string;
}

class LinkGuardianDto {
  @IsEmail()
  email: string;
}

@Roles('ADMIN')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Roles('ADMIN', 'OPERATOR')
  @Get()
  list(@Query() q: ListQuery) {
    return this.students.list(q);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.students.get(id);
  }

  @Post()
  create(@Body() dto: StudentDto) {
    return this.students.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  /** Desativar em vez de apagar: o histórico financeiro continua. */
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.students.update(id, { active: false });
  }

  @Post(':id/regenerate-code')
  regenerateCode(@Param('id') id: string) {
    return this.students.regenerateCode(id);
  }

  @Post('import')
  importCsv(@Body() dto: ImportDto) {
    return this.students.importCsv(dto.csv);
  }

  @Post(':id/guardians')
  linkGuardian(@Param('id') id: string, @Body() dto: LinkGuardianDto) {
    return this.students.linkGuardian(id, dto.email);
  }

  @Delete(':id/guardians/:guardianId')
  unlinkGuardian(@Param('id') id: string, @Param('guardianId') guardianId: string) {
    return this.students.unlinkGuardian(id, guardianId);
  }
}

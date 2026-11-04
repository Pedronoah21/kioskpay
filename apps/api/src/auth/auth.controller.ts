import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles, type AuthUser } from './auth.decorators';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class RegisterDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres' })
  password: string;

  @IsString()
  document: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'A nova senha precisa ter pelo menos 8 caracteres' })
  newPassword: string;
}

class CreateStaffDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(['ADMIN', 'OPERATOR'])
  role: Role;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.registerGuardian(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Roles('ADMIN')
  @Post('staff')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.auth.createStaff(dto);
  }
}

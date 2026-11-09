import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';

/**
 * Guard global: toda rota exige token, exceto as marcadas com @Public().
 * Se a rota tiver @Roles(...), o perfil também é conferido.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Faça login para continuar');

    let payload: { sub: string; role: Role; name: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada, faça login novamente');
    }
    // A sessão curta do aluno no totem não vale como login de usuário
    if ((payload as { typ?: string }).typ === 'kiosk-student' || !payload.role) {
      throw new UnauthorizedException('Faça login para continuar');
    }
    const user: AuthUser = { id: payload.sub, role: payload.role, name: payload.name };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Seu perfil não tem acesso a esta função');
    }
    return true;
  }
}

import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Rota sem login (cadastro, login, webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restringe a rota aos perfis informados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Usuário autenticado da requisição. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

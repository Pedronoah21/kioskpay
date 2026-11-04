/**
 * Cria o primeiro administrador. Rode uma vez: npm run prisma:seed
 * Usa SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD do .env.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 8 caracteres) no .env');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} já existe.`);
    return;
  }
  await prisma.user.create({
    data: { name: 'Administrador', email, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN' },
  });
  console.log(`Admin ${email} criado.`);
}

main().finally(() => prisma.$disconnect());

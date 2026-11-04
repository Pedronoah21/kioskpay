import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' }); // importação de planilhas
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ ok: true }));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`KioskPay API rodando na porta ${port}`);
}

bootstrap();

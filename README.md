# KioskPay

Cantina escolar pré-paga para uma escola: os responsáveis recarregam saldo por Pix (e depois cartão), e o aluno consome na cantina identificado por QR code ou NFC.

## Estrutura

```
apps/
  api/        API em NestJS + Prisma + PostgreSQL  (pronta: carteira, recargas, vendas, webhook)
  mobile/     (próximo) app dos pais em React Native/Expo
  web/        (próximo) PDV da cantina e painel admin em Next.js
```

## Regras centrais

- **O saldo nunca é editado direto.** Todo movimento é um lançamento (`LedgerEntry`); `Wallet.balanceCents` é um cache atualizado na mesma transação. `GET /students/:id/wallet/audit` confere os dois.
- **Valores sempre em centavos** (inteiro).
- **A recarga só entra no saldo quando o gateway confirma** pelo webhook. O webhook é idempotente: o mesmo evento nunca credita duas vezes.
- **Compra validada no servidor:** saldo, limite diário, produtos/categorias bloqueados pelo responsável, estoque e aluno ativo (`src/sales/sale-rules.ts`, sem dependência de banco, reutilizável no PDV offline).
- **Vendas offline** enviam `offlineUuid`; reenviar a mesma venda não duplica.
- **Chargeback/estorno de recarga** retira o valor e pode deixar a carteira negativa até regularizar.

## Gateway de pagamento

O sistema só conhece a interface `PaymentGateway` (`src/payments/payment-gateway.ts`). O provedor ativo é escolhido por `PAYMENT_GATEWAY`.

- **PicPay** (implementado): `src/payments/picpay/picpay.gateway.ts`, com base na [API Pix PicPay](https://developers-business.picpay.com/pix/docs/introduction):
  - `POST /oauth2/token` (client_credentials, token de 5 min)
  - `POST /charge/pix`, `GET /charge/{merchantChargeId}`, `/charge/{merchantChargeId}/refund`
  - Webhook autenticado pelo header `Authorization` com o token do Painel Lojista
- **Stone/Pagar.me**: para trocar, crie um adaptador que implemente `PaymentGateway` e registre em `app.module.ts`.

**Confirmar no sandbox do PicPay:** formato da resposta do `/oauth2/token`, corpo do `/refund`, nome exato do header de evento do webhook e se há cartão de débito online.

URL a cadastrar no Painel Lojista (Ajustes > Meu checkout > URL de notificação): `https://SEU_DOMINIO/webhooks/payments` (HTTPS, sem query string).

## Rodando a API

```bash
npm install
cp apps/api/.env.example apps/api/.env   # preencha DATABASE_URL e credenciais PicPay
cd apps/api
npx prisma migrate dev
npm run start:dev
npm test
```

## Endpoints atuais

| Método | Rota | Uso |
| --- | --- | --- |
| POST | `/recharges/pix` | Responsável gera Pix `{ studentId, amountCents }` |
| POST | `/recharges/manual` | Recarga no balcão `{ studentId, amountCents, method: CASH\|POS }` |
| GET | `/recharges/mine` | Recargas do responsável |
| POST | `/webhooks/payments` | Notificação do gateway |
| GET | `/sales/identify/:code` | PDV lê QR/NFC e recebe nome, foto e saldo |
| POST | `/sales` | Venda `{ studentId, items: [{ productId, quantity }], offlineUuid? }` |
| POST | `/sales/:id/refund` | Estorno de venda `{ reason }` |
| GET | `/students/:id/wallet` | Saldo |
| GET | `/students/:id/wallet/statement` | Extrato |
| GET | `/students/:id/wallet/audit` | Confere saldo × lançamentos |

> **Ainda sem autenticação:** os controllers usam o header provisório `x-user-id`. O próximo passo é login com JWT e permissões por perfil (admin, operador, responsável).

## Próximos passos

1. Autenticação JWT + permissões por perfil
2. CRUD de alunos, turmas, produtos e restrições (com importação de planilha)
3. App dos pais (Expo): login, filhos, recarga Pix, extrato, bloqueios
4. PDV web com leitura de QR e modo offline
5. Notificações de compra e saldo baixo

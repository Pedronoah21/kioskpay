# KioskPay

Cantina escolar pré-paga para uma escola: os responsáveis recarregam saldo por Pix (e depois cartão), e o aluno consome na cantina identificado por QR code ou NFC.

## Estrutura

```
apps/
  api/        API em NestJS + Prisma + PostgreSQL  (pronta: carteira, recargas, vendas, webhook)
  mobile/     App dos pais em Expo (Android, iPhone e navegador)
  web/        Painel da escola (administração e caixa) em React + Vite
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

Crie o primeiro administrador (usa `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` do `.env`):

```bash
npm run prisma:seed
```

## Produção

- **API:** https://kioskpay-api.onrender.com (Render, região Virgínia). Deploy automático a cada push na `main`.
- **Banco:** PostgreSQL no Neon (projeto `kioskpay`, N. Virgínia).
- Na inicialização a API aplica as migrações e cria o admin de `SEED_ADMIN_EMAIL` se ele ainda não existir.
- Variáveis de ambiente ficam no painel do Render (nunca no repositório).

> O plano gratuito do Render "dorme" após ~15 min sem uso e leva cerca de 1 minuto para acordar. Para uso real (e para o webhook do PicPay não esperar), use o plano Starter.

## Painel da escola (`apps/web`)

Acesso pelo navegador com login de administrador ou operador de caixa.

- **Alunos:** busca, filtro por turma, cadastro, edição, desativação, carteirinha com QR code para imprimir, novo código para carteirinha perdida, vínculo de responsáveis, recarga no balcão e extrato
- **Importar planilha:** CSV do Excel (UTF-8 ou o padrão do Windows), com prévia e lista de linhas com problema
- **Turmas, Produtos/Categorias/Estoque, Equipe** (operadores e administradores) e **Minha conta** (trocar senha)
- **Caixa:** identifica o aluno por leitor USB (código + Enter), câmera (QR da carteirinha) ou nome; mostra saldo, quanto pode gastar hoje e os itens bloqueados pelos pais; carrinho com quantidades; F2 finaliza, Esc troca de aluno, Enter chama o próximo. Cliques repetidos não duplicam a venda.
- **Vendas do dia:** total, quantidade, ticket médio, itens por venda; estorno (só administrador) devolve saldo e estoque
- Operador de caixa vê Caixa, Vendas do dia, Alunos, Produtos (estoque) e Minha conta, e entra direto no Caixa

```bash
cd apps/web
npm install
VITE_API_URL=http://localhost:3000 npm run dev
```

## Totem de autoatendimento

O mesmo painel vira totem quando entra com um usuário de perfil **Totem** (crie em Equipe › Novo usuário › Perfil: Totem).

1. O aluno passa a carteirinha (leitor USB) ou mostra o QR para a câmera
2. Digita a senha de 4 números (definida pelos pais no app ou pela escola na ficha do aluno)
3. Escolhe os itens (bloqueios dos pais e limite diário já aplicados), confere e confirma
4. Recebe o número do pedido; a cantina vê em **Pedidos do totem**, marca "Pronto" e depois "Entregue"

Segurança: 5 senhas erradas bloqueiam a carteirinha no totem por 15 min; a sessão do aluno vale 5 min e só no totem que a criou; sem toque por 45 s o totem volta ao início; o perfil Totem não acessa cadastros. Para sair do modo totem: 5 toques rápidos no logo e a senha do usuário do totem (ali também liga a tela cheia).

Dica de instalação: no tablet/PC do totem, abra o painel no Chrome em modo quiosque (`chrome --kiosk https://kioskpay-painel.onrender.com`) ou "Fixar app" no Android.

## App dos pais (`apps/mobile`)

Expo SDK 58 com Expo Router. O mesmo código roda no Android, no iPhone e no navegador (portal web dos pais).

Telas: login, cadastro (com máscara de CPF), lista de filhos com saldo, extrato, recarga por Pix (QR code, copia e cola e confirmação automática quando o pagamento cai) e limite diário/bloqueios.

```bash
cd apps/mobile
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL = endereço da API
npx expo start              # abra no Expo Go pelo QR code, ou tecle "w" para o navegador
```

Para testar no celular com a API rodando no computador, use o IP do computador na rede (ex.: `http://192.168.0.10:3000`), não `localhost`.

Checagens: `npx tsc --noEmit` e `npx eslint .`

Publicação nas lojas: `npx eas-cli@latest build` (gera os instaladores na nuvem) e `npx eas-cli@latest submit`.

## Login e perfis

Toda rota exige `Authorization: Bearer <token>`, exceto cadastro, login e webhook.

| Perfil | Como é criado | Pode |
| --- | --- | --- |
| ADMIN | `npm run prisma:seed` ou outro admin | tudo, incluindo estornos, auditoria e vincular pais a alunos |
| OPERATOR | admin em `POST /auth/staff` | identificar aluno, vender, lançar recarga no balcão |
| GUARDIAN | o próprio responsável em `POST /auth/register` (CPF validado) | ver só os próprios filhos, gerar Pix, ver extrato |

Fluxo do responsável: cadastra-se no app → a escola vincula pelo e-mail (`POST /students/:id/guardians`) → os filhos aparecem em `GET /auth/me`.

## Endpoints atuais

| Método | Rota | Perfil | Uso |
| --- | --- | --- | --- |
| POST | `/auth/register` | público | Cadastro do responsável `{ name, email, password, document, phone? }` |
| POST | `/auth/login` | público | `{ email, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | todos | Dados do usuário e, para responsável, os filhos com saldo |
| POST | `/auth/staff` | ADMIN | Cria operador ou admin |
| GET | `/students?search=&classroomId=&active=` | ADMIN, OPERATOR | Lista alunos com saldo |
| GET | `/students/:id` | ADMIN, OPERATOR | Detalhe com responsáveis |
| POST | `/students` | ADMIN | Cria aluno (QR da carteirinha e carteira gerados automaticamente) |
| PATCH | `/students/:id` | ADMIN | Edita aluno |
| DELETE | `/students/:id` | ADMIN | Desativa (o histórico financeiro continua) |
| POST | `/students/:id/regenerate-code` | ADMIN | Carteirinha perdida: novo QR, o antigo para de funcionar |
| POST | `/students/import` | ADMIN | Importa CSV `{ csv }` (ver abaixo) |
| POST | `/students/:id/guardians` | ADMIN | Vincula responsável `{ email }` |
| DELETE | `/students/:id/guardians/:guardianId` | ADMIN | Desvincula responsável |
| GET | `/students/:id/controls` | GUARDIAN (do filho), ADMIN | Limite diário e bloqueios |
| PUT | `/students/:id/controls/daily-limit` | GUARDIAN, ADMIN | `{ dailyLimitCents }` (`null` remove) |
| POST | `/students/:id/controls/restrictions` | GUARDIAN, ADMIN | Bloqueia `{ productId }` ou `{ categoryId }` |
| DELETE | `/students/:id/controls/restrictions/:rid` | GUARDIAN, ADMIN | Desbloqueia |
| GET/POST/PATCH | `/classrooms` | ADMIN (leitura: OPERATOR) | Turmas |
| GET/POST | `/categories` | leitura: todos; criar: ADMIN | Categorias |
| GET | `/products?lowStock=true` | todos | Cardápio (e estoque baixo) |
| POST/PATCH/DELETE | `/products` | ADMIN | Produtos (delete desativa) |
| POST | `/products/:id/stock` | ADMIN, OPERATOR | Entrada ou baixa `{ delta }` |
| POST | `/recharges/pix` | GUARDIAN | Gera Pix `{ studentId, amountCents }` |
| POST | `/recharges/manual` | ADMIN, OPERATOR | Recarga no balcão `{ studentId, amountCents, method: CASH\|POS }` |
| GET | `/recharges/mine` | GUARDIAN | Recargas do responsável |
| POST | `/webhooks/payments` | gateway | Notificação de pagamento |
| GET | `/sales/identify/:code` | ADMIN, OPERATOR | Lê QR/NFC e devolve nome, foto e saldo |
| POST | `/sales` | ADMIN, OPERATOR | Venda `{ studentId, items: [{ productId, quantity }], offlineUuid? }` |
| POST | `/sales/:id/refund` | ADMIN | Estorno de venda `{ reason }` |
| GET | `/students/:id/wallet` | dono ou equipe | Saldo |
| GET | `/students/:id/wallet/statement` | dono ou equipe | Extrato |
| GET | `/students/:id/wallet/audit` | ADMIN | Confere saldo × lançamentos |

## Importação de alunos (CSV)

Salve a planilha como CSV no Excel (separador `;` ou `,`). Cabeçalho, com ou sem acento:

```
Nome;Matrícula;Turma;Série;Turno;Limite diário
Ana Souza;1001;5º A;5º ano;Manhã;15,00
Bruno Lima;1003;6º B;6º ano;Tarde;
```

- `Nome` e `Matrícula` são obrigatórios; o resto é opcional.
- Matrícula já existente **atualiza** o aluno em vez de duplicar.
- Turmas que não existem são criadas.
- Linhas com problema são puladas e voltam listadas com o número da linha.

## Próximos passos

1. Publicar a API com HTTPS e testar o Pix no sandbox do PicPay
2. PDV web com leitura de QR e modo offline
3. Painel admin web (cadastros, importação, relatórios)
4. Notificações de compra e saldo baixo
5. Relatórios: vendas por dia/produto, recargas, saldo total em aberto

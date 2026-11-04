/**
 * Regras de compra, sem dependência de banco (fácil de testar e
 * reaproveitar no PDV offline).
 */

export interface CartItem {
  productId: string;
  categoryId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  active: boolean;
}

export interface SaleContext {
  balanceCents: number;
  dailyLimitCents: number | null;
  spentTodayCents: number;
  blockedProductIds: Set<string>;
  blockedCategoryIds: Set<string>;
  studentActive: boolean;
}

export type SaleRejection =
  | { code: 'STUDENT_INACTIVE' }
  | { code: 'EMPTY_CART' }
  | { code: 'INVALID_QUANTITY'; productId: string }
  | { code: 'PRODUCT_INACTIVE'; productId: string; name: string }
  | { code: 'OUT_OF_STOCK'; productId: string; name: string; stock: number }
  | { code: 'BLOCKED_BY_GUARDIAN'; productId: string; name: string }
  | { code: 'DAILY_LIMIT'; limitCents: number; availableCents: number }
  | { code: 'INSUFFICIENT_BALANCE'; balanceCents: number; totalCents: number };

export function evaluateSale(
  items: CartItem[],
  ctx: SaleContext,
): { ok: true; totalCents: number } | { ok: false; reason: SaleRejection } {
  if (!ctx.studentActive) return { ok: false, reason: { code: 'STUDENT_INACTIVE' } };
  if (items.length === 0) return { ok: false, reason: { code: 'EMPTY_CART' } };

  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { ok: false, reason: { code: 'INVALID_QUANTITY', productId: item.productId } };
    }
    if (!item.active) {
      return { ok: false, reason: { code: 'PRODUCT_INACTIVE', productId: item.productId, name: item.name } };
    }
    if (
      ctx.blockedProductIds.has(item.productId) ||
      (item.categoryId !== null && ctx.blockedCategoryIds.has(item.categoryId))
    ) {
      return { ok: false, reason: { code: 'BLOCKED_BY_GUARDIAN', productId: item.productId, name: item.name } };
    }
    if (item.stock < item.quantity) {
      return {
        ok: false,
        reason: { code: 'OUT_OF_STOCK', productId: item.productId, name: item.name, stock: item.stock },
      };
    }
    total += item.unitPriceCents * item.quantity;
  }

  if (ctx.dailyLimitCents !== null && ctx.spentTodayCents + total > ctx.dailyLimitCents) {
    return {
      ok: false,
      reason: {
        code: 'DAILY_LIMIT',
        limitCents: ctx.dailyLimitCents,
        availableCents: Math.max(0, ctx.dailyLimitCents - ctx.spentTodayCents),
      },
    };
  }

  if (total > ctx.balanceCents) {
    return { ok: false, reason: { code: 'INSUFFICIENT_BALANCE', balanceCents: ctx.balanceCents, totalCents: total } };
  }

  return { ok: true, totalCents: total };
}

export function rejectionMessage(r: SaleRejection): string {
  const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
  switch (r.code) {
    case 'STUDENT_INACTIVE':
      return 'Aluno inativo';
    case 'EMPTY_CART':
      return 'Nenhum item na venda';
    case 'INVALID_QUANTITY':
      return 'Quantidade inválida';
    case 'PRODUCT_INACTIVE':
      return `${r.name} não está disponível`;
    case 'OUT_OF_STOCK':
      return `${r.name}: estoque insuficiente (${r.stock})`;
    case 'BLOCKED_BY_GUARDIAN':
      return `${r.name} foi bloqueado pelo responsável`;
    case 'DAILY_LIMIT':
      return `Limite diário atingido. Disponível hoje: ${brl(r.availableCents)}`;
    case 'INSUFFICIENT_BALANCE':
      return `Saldo insuficiente: ${brl(r.balanceCents)} para uma compra de ${brl(r.totalCents)}`;
  }
}

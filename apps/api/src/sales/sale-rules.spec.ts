import { CartItem, evaluateSale, SaleContext } from './sale-rules';

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1',
  categoryId: 'c-lanche',
  name: 'Coxinha',
  unitPriceCents: 600,
  quantity: 1,
  stock: 10,
  active: true,
  ...over,
});

const ctx = (over: Partial<SaleContext> = {}): SaleContext => ({
  balanceCents: 2000,
  dailyLimitCents: null,
  spentTodayCents: 0,
  blockedProductIds: new Set(),
  blockedCategoryIds: new Set(),
  studentActive: true,
  ...over,
});

describe('evaluateSale', () => {
  it('aprova e soma o total', () => {
    expect(evaluateSale([item({ quantity: 2 }), item({ productId: 'p2', unitPriceCents: 400 })], ctx())).toEqual({
      ok: true,
      totalCents: 1600,
    });
  });

  it('recusa saldo insuficiente', () => {
    const r = evaluateSale([item({ quantity: 4 })], ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('aceita compra que usa exatamente todo o saldo', () => {
    expect(evaluateSale([item({ unitPriceCents: 2000 })], ctx()).ok).toBe(true);
  });

  it('respeita o limite diário considerando o já gasto', () => {
    const r = evaluateSale([item()], ctx({ dailyLimitCents: 1000, spentTodayCents: 500 }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason.code === 'DAILY_LIMIT') expect(r.reason.availableCents).toBe(500);
  });

  it('bloqueia produto restringido pelo responsável', () => {
    const r = evaluateSale([item()], ctx({ blockedProductIds: new Set(['p1']) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe('BLOCKED_BY_GUARDIAN');
  });

  it('bloqueia pela categoria', () => {
    const r = evaluateSale([item({ categoryId: 'c-refri' })], ctx({ blockedCategoryIds: new Set(['c-refri']) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe('BLOCKED_BY_GUARDIAN');
  });

  it('recusa sem estoque, inativo e aluno inativo', () => {
    const a = evaluateSale([item({ stock: 0 })], ctx());
    const b = evaluateSale([item({ active: false })], ctx());
    const c = evaluateSale([item()], ctx({ studentActive: false }));
    expect([a, b, c].map((r) => (r.ok ? 'ok' : r.reason.code))).toEqual([
      'OUT_OF_STOCK',
      'PRODUCT_INACTIVE',
      'STUDENT_INACTIVE',
    ]);
  });

  it('recusa carrinho vazio e quantidade inválida', () => {
    const a = evaluateSale([], ctx());
    const b = evaluateSale([item({ quantity: 0 })], ctx());
    expect([a, b].map((r) => (r.ok ? 'ok' : r.reason.code))).toEqual(['EMPTY_CART', 'INVALID_QUANTITY']);
  });
});

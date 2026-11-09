import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type CheckoutStudent, type Product, type Student } from '../api';
import { brl } from '../format';
import { beep, CameraScanner } from '../scanner';
import { Alert, Spinner, useLoad } from '../ui';

type Cart = Map<string, number>;

/** Quanto o aluno ainda pode gastar agora: o menor entre saldo e o que resta do limite do dia. */
function available(s: CheckoutStudent) {
  const byLimit = s.dailyLimitCents === null ? Infinity : Math.max(0, s.dailyLimitCents - s.spentTodayCents);
  return Math.max(0, Math.min(s.balanceCents, byLimit));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Checkout() {
  const products = useLoad(() => api.products(), []);
  const categories = useLoad(() => api.categories(), []);
  const [student, setStudent] = useState<CheckoutStudent | null>(null);
  const [cart, setCart] = useState<Cart>(new Map());
  const [category, setCategory] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; totalCents: number; balanceCents: number } | null>(null);
  // Mesmo id em tentativas repetidas da mesma venda: a API não duplica (ex.: clique duplo, internet caiu)
  const saleKey = useRef<string | null>(null);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  const isBlocked = useCallback(
    (p: Product) =>
      !!student &&
      (student.blockedProductIds.includes(p.id) || (!!p.categoryId && student.blockedCategoryIds.includes(p.categoryId))),
    [student],
  );

  const lines = [...cart.entries()]
    .map(([id, qty]) => ({ product: productById.get(id)!, qty }))
    .filter((l) => l.product);
  const total = lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);
  const canSpend = student ? available(student) : 0;
  const over = !!student && total > canSpend;

  function reset() {
    setStudent(null);
    setCart(new Map());
    setError(null);
    setDone(null);
    saleKey.current = null;
  }

  function choose(s: CheckoutStudent) {
    setStudent(s);
    setCart(new Map());
    setError(null);
    setDone(null);
    saleKey.current = null;
    beep(true);
  }

  function add(p: Product) {
    if (!student || isBlocked(p)) return;
    setError(null);
    saleKey.current = null;
    setCart((c) => {
      const next = new Map(c);
      const q = (next.get(p.id) ?? 0) + 1;
      if (q > p.stock) {
        setError(`${p.name}: só há ${p.stock} em estoque.`);
        return c;
      }
      next.set(p.id, q);
      return next;
    });
  }

  function setQty(id: string, q: number) {
    saleKey.current = null;
    setCart((c) => {
      const next = new Map(c);
      if (q <= 0) next.delete(id);
      else next.set(id, Math.min(q, productById.get(id)?.stock ?? q));
      return next;
    });
  }

  async function finish() {
    if (!student || !lines.length || busy || over) return;
    setBusy(true);
    setError(null);
    saleKey.current ??= crypto.randomUUID();
    try {
      const sale = await api.sell({
        studentId: student.id,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        offlineUuid: saleKey.current,
      });
      const balance =
        typeof sale.balanceAfterCents === 'number'
          ? sale.balanceAfterCents
          : (await api.checkout(student.id)).balanceCents;
      beep(true);
      setDone({ name: student.name, totalCents: sale.totalCents, balanceCents: balance });
      products.reload(); // estoque atualizado
    } catch (e) {
      beep(false);
      setError((e as Error).message);
      // Atualiza saldo/limite caso tenha mudado (ex.: recarga ou outra venda)
      api.checkout(student.id).then(setStudent).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  // Atalhos: Esc troca de aluno; F2 ou Ctrl+Enter finaliza; Enter na tela de sucesso chama o próximo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal')) return;
      if (done && e.key === 'Enter') {
        e.preventDefault();
        reset();
      } else if (e.key === 'Escape' && student) {
        reset();
      } else if (e.key === 'F2' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = (products.data ?? []).filter((p) => !category || p.categoryId === category);

  if (done) {
    return (
      <div className="checkout-done">
        <div className="done-check" aria-hidden>
          ✓
        </div>
        <h1>Venda concluída</h1>
        <p className="muted">{done.name}</p>
        <div className="done-numbers">
          <div>
            <span>Total</span>
            <strong>{brl(done.totalCents)}</strong>
          </div>
          <div>
            <span>Saldo restante</span>
            <strong className={done.balanceCents < 500 ? 'negative' : ''}>{brl(done.balanceCents)}</strong>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={reset} autoFocus>
          Próximo aluno (Enter)
        </button>
      </div>
    );
  }

  return (
    <div className="checkout">
      <section className="checkout-side">
        {student ? (
          <StudentCard student={student} onChange={reset} canSpend={canSpend} />
        ) : (
          <Identify onFound={choose} />
        )}

        {student && (
          <div className="card cart">
            <h2>Itens</h2>
            {lines.length === 0 ? (
              <p className="muted">Toque nos produtos para adicionar.</p>
            ) : (
              <ul className="cart-lines">
                {lines.map(({ product: p, qty }) => (
                  <li key={p.id}>
                    <div className="cart-name">
                      <strong>{p.name}</strong>
                      <span className="muted">{brl(p.priceCents)} cada</span>
                    </div>
                    <div className="qty">
                      <button aria-label={`Menos ${p.name}`} onClick={() => setQty(p.id, qty - 1)}>
                        −
                      </button>
                      <span>{qty}</span>
                      <button aria-label={`Mais ${p.name}`} onClick={() => setQty(p.id, qty + 1)}>
                        +
                      </button>
                    </div>
                    <span className="cart-sub">{brl(p.priceCents * qty)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="cart-total">
              <span>Total</span>
              <strong>{brl(total)}</strong>
            </div>
            {over && (
              <Alert>
                Passa do disponível ({brl(canSpend)}).{' '}
                {student.dailyLimitCents !== null && student.dailyLimitCents - student.spentTodayCents < student.balanceCents
                  ? 'Limite diário definido pelos pais.'
                  : 'Saldo insuficiente.'}
              </Alert>
            )}
            <Alert>{error}</Alert>
            <button className="btn btn-primary btn-lg" disabled={!lines.length || busy || over} onClick={finish}>
              {busy ? 'Registrando…' : `Finalizar venda · ${brl(total)}`}
            </button>
            <p className="muted shortcut">F2 finaliza · Esc troca de aluno</p>
          </div>
        )}
      </section>

      <section className="checkout-products">
        <div className="cat-tabs" role="tablist">
          <button className={category === '' ? 'on' : ''} onClick={() => setCategory('')}>
            Todos
          </button>
          {categories.data?.map((c) => (
            <button key={c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <Alert>{products.error}</Alert>
        {products.loading && !products.data ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <div className="empty">Nenhum produto cadastrado nesta categoria.</div>
        ) : (
          <div className={`product-grid ${student ? '' : 'idle'}`}>
            {shown.map((p) => {
              const blocked = isBlocked(p);
              const out = p.stock <= 0;
              const inCart = cart.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  className={`product ${blocked ? 'blocked' : ''} ${inCart ? 'in-cart' : ''}`}
                  disabled={!student || blocked || out}
                  onClick={() => add(p)}>
                  {inCart > 0 && <span className="badge">{inCart}</span>}
                  <span className="product-name">{p.name}</span>
                  <span className="product-price">{brl(p.priceCents)}</span>
                  {blocked ? (
                    <span className="product-flag">Bloqueado pelos pais</span>
                  ) : out ? (
                    <span className="product-flag">Sem estoque</span>
                  ) : (
                    <span className="product-stock">{p.stock} em estoque</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StudentCard({
  student,
  canSpend,
  onChange,
}: {
  student: CheckoutStudent;
  canSpend: number;
  onChange: () => void;
}) {
  const limitLeft = student.dailyLimitCents === null ? null : student.dailyLimitCents - student.spentTodayCents;
  return (
    <div className="card student-card">
      <div className="student-head">
        {student.photoUrl ? (
          <img className="avatar" src={student.photoUrl} alt="" />
        ) : (
          <span className="avatar">{initials(student.name)}</span>
        )}
        <div>
          <strong>{student.name}</strong>
          <span className="muted">
            {student.classroom ?? 'Sem turma'} · Mat. {student.enrollment}
          </span>
        </div>
        <button className="btn btn-ghost" onClick={onChange}>
          Trocar
        </button>
      </div>
      {!student.active && <Alert>Aluno inativo: não pode comprar.</Alert>}
      <div className="student-money">
        <div>
          <span>Saldo</span>
          <strong className={student.balanceCents <= 0 ? 'negative' : ''}>{brl(student.balanceCents)}</strong>
        </div>
        <div>
          <span>Pode gastar agora</span>
          <strong>{brl(canSpend)}</strong>
        </div>
      </div>
      {limitLeft !== null && (
        <p className="muted small">
          Limite diário {brl(student.dailyLimitCents!)} · já gastou {brl(student.spentTodayCents)} hoje
        </p>
      )}
      {(student.blockedProductIds.length > 0 || student.blockedCategoryIds.length > 0) && (
        <p className="muted small">Os pais bloquearam alguns itens (aparecem riscados).</p>
      )}
    </div>
  );
}

function Identify({ onFound }: { onFound: (s: CheckoutStudent) => void }) {
  const [text, setText] = useState('');
  const [matches, setMatches] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // Busca por nome enquanto digita (códigos de carteirinha começam com KP-)
  useEffect(() => {
    const t = text.trim();
    if (t.length < 2 || /^kp-/i.test(t)) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .students({ search: t, take: 8 })
        .then((r) => setMatches(r.items.filter((s) => s.active)))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const lookupCode = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      try {
        onFound(await api.identify(code));
      } catch (e) {
        beep(false);
        setError((e as Error).message);
        setText('');
        input.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [onFound],
  );

  async function pick(id: string) {
    setBusy(true);
    try {
      onFound(await api.checkout(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    // Código de carteirinha (leitor USB ou digitado)
    if (/^kp-/i.test(t) || !/\s/.test(t) && /\d/.test(t)) return lookupCode(t);
    // Nome: busca agora, sem esperar a busca automática
    setBusy(true);
    try {
      const found = (await api.students({ search: t, take: 8 })).items.filter((s) => s.active);
      if (found.length === 1) return pick(found[0].id);
      if (found.length > 1) return setMatches(found);
    } catch {
      // cai na tentativa como código
    } finally {
      setBusy(false);
    }
    lookupCode(t);
  }

  const onCamera = useCallback(
    (code: string) => {
      setCamera(false);
      lookupCode(code);
    },
    [lookupCode],
  );

  return (
    <div className="card identify">
      <h2>Identificar aluno</h2>
      <form onSubmit={submit} className="identify-form">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Passe a carteirinha no leitor, digite o código ou o nome"
          aria-label="Código da carteirinha ou nome do aluno"
          autoComplete="off"
          disabled={busy}
        />
        <button className="btn btn-secondary" type="button" onClick={() => setCamera(true)}>
          Câmera
        </button>
      </form>
      {busy && <Spinner label="Buscando aluno…" />}
      <Alert>{error}</Alert>
      {matches.length > 0 && (
        <ul className="matches">
          {matches.map((s) => (
            <li key={s.id}>
              <button onClick={() => pick(s.id)}>
                <strong>{s.name}</strong>
                <span className="muted">
                  {s.classroom?.name ?? 'Sem turma'} · Mat. {s.enrollment}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {camera && <CameraScanner onCode={onCamera} onClose={() => setCamera(false)} />}
    </div>
  );
}

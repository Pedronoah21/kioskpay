import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type CheckoutStudent, type Product } from '../api';
import { useAuth } from '../auth';
import { brl } from '../format';
import { beep, CameraScanner } from '../scanner';

type Step =
  | { name: 'idle'; message?: string }
  | { name: 'pin'; code: string; firstName: string }
  | { name: 'menu' }
  | { name: 'review' }
  | { name: 'done'; orderNumber: number; totalCents: number; balanceCents: number };

const IDLE_SECONDS = 45; // sem toque nesse tempo, volta para a tela inicial
const DONE_SECONDS = 12;

function available(s: CheckoutStudent) {
  const byLimit = s.dailyLimitCents === null ? Infinity : Math.max(0, s.dailyLimitCents - s.spentTodayCents);
  return Math.max(0, Math.min(s.balanceCents, byLimit));
}

const pad = (n: number) => String(n).padStart(3, '0');

export default function Totem() {
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [student, setStudent] = useState<CheckoutStudent | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderKey = useRef<string | null>(null);

  const loadCatalog = useCallback(() => {
    api.products().then(setProducts).catch(() => undefined);
    api.categories().then(setCategories).catch(() => undefined);
  }, []);
  useEffect(loadCatalog, [loadCatalog]);

  const reset = useCallback(
    (message?: string) => {
      setStudent(null);
      setSession(null);
      setCart(new Map());
      setCategory('');
      setError(null);
      setBusy(false);
      orderKey.current = null;
      setStep({ name: 'idle', message });
      loadCatalog(); // estoque e preços atualizados para o próximo aluno
    },
    [loadCatalog],
  );

  // Volta sozinho para o início se o aluno sair no meio
  const lastTouch = useRef(Date.now());
  useEffect(() => {
    const touch = () => (lastTouch.current = Date.now());
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);
  useEffect(() => {
    if (step.name === 'idle') return;
    lastTouch.current = Date.now();
    const limit = step.name === 'done' ? DONE_SECONDS : IDLE_SECONDS;
    const t = setInterval(() => {
      if (Date.now() - lastTouch.current > limit * 1000) reset();
    }, 1000);
    return () => clearInterval(t);
  }, [step.name, reset]);

  // ----- Carteirinha -----
  async function onCard(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.kioskCard(code);
      if (r.lockedMinutes > 0) {
        beep(false);
        reset(`Muitas senhas erradas. Tente de novo em ${r.lockedMinutes} min ou compre no balcão.`);
      } else if (!r.hasPin) {
        beep(false);
        reset(`${r.firstName}, você ainda não tem senha. Peça aos seus pais para criar no app KioskPay.`);
      } else {
        beep(true);
        setError(null);
        setStep({ name: 'pin', code, firstName: r.firstName });
      }
    } catch (e) {
      beep(false);
      reset((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ----- Senha -----
  async function onPin(code: string, pin: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.kioskLogin(code, pin);
      setSession(r.session);
      setStudent(r.student);
      beep(true);
      setStep({ name: 'menu' });
    } catch (e) {
      beep(false);
      const msg = (e as Error).message;
      if (/bloquead|tentativas erradas|ainda não tem senha|inativa/i.test(msg)) reset(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  // ----- Pedido -----
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = [...cart.entries()].map(([id, q]) => ({ p: byId.get(id)!, q })).filter((l) => l.p);
  const total = lines.reduce((s, l) => s + l.p.priceCents * l.q, 0);
  const count = lines.reduce((s, l) => s + l.q, 0);
  const canSpend = student ? available(student) : 0;

  const blocked = (p: Product) =>
    !!student &&
    (student.blockedProductIds.includes(p.id) || (!!p.categoryId && student.blockedCategoryIds.includes(p.categoryId)));

  function add(p: Product) {
    setError(null);
    orderKey.current = null;
    const q = (cart.get(p.id) ?? 0) + 1;
    if (q > p.stock) return setError(`Acabou o estoque de ${p.name}.`);
    if (total + p.priceCents > canSpend) {
      beep(false);
      return setError(`${p.name} não cabe: restam ${brl(Math.max(0, canSpend - total))} para gastar.`);
    }
    setCart(new Map(cart).set(p.id, q));
  }

  function setQty(id: string, q: number) {
    orderKey.current = null;
    setError(null);
    const next = new Map(cart);
    if (q <= 0) next.delete(id);
    else next.set(id, q);
    setCart(next);
    if (next.size === 0 && step.name === 'review') setStep({ name: 'menu' });
  }

  async function confirm() {
    if (!session || !lines.length || busy) return;
    setBusy(true);
    setError(null);
    orderKey.current ??= crypto.randomUUID();
    try {
      const r = await api.kioskOrder(
        session,
        lines.map((l) => ({ productId: l.p.id, quantity: l.q })),
        orderKey.current,
      );
      beep(true);
      setStep({ name: 'done', orderNumber: r.orderNumber, totalCents: r.totalCents, balanceCents: r.balanceAfterCents });
    } catch (e) {
      beep(false);
      const msg = (e as Error).message;
      if (/tempo esgotado|sessão/i.test(msg)) reset(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const shown = products.filter((p) => (!category || p.categoryId === category) && p.stock > 0);

  return (
    <div className="totem">
      <TotemHeader
        student={step.name === 'menu' || step.name === 'review' ? student : null}
        canSpend={Math.max(0, canSpend - total)}
        onCancel={() => reset()}
      />

      {step.name === 'idle' && <Idle message={step.message} onCard={onCard} busy={busy} />}

      {step.name === 'pin' && (
        <PinPad
          firstName={step.firstName}
          busy={busy}
          error={error}
          onSubmit={(pin) => onPin(step.code, pin)}
          onCancel={() => reset()}
        />
      )}

      {step.name === 'menu' && student && (
        <div className="totem-menu">
          <div className="totem-cats">
            <button className={category === '' ? 'on' : ''} onClick={() => setCategory('')}>
              Tudo
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? 'on' : ''}
                onClick={() => setCategory(c.id)}
                disabled={student.blockedCategoryIds.includes(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="totem-grid">
            {shown.map((p) => {
              const b = blocked(p);
              const q = cart.get(p.id) ?? 0;
              return (
                <button key={p.id} className={`totem-product ${q ? 'picked' : ''}`} disabled={b} onClick={() => add(p)}>
                  {q > 0 && <span className="badge">{q}</span>}
                  <span className="tp-name">{p.name}</span>
                  <span className="tp-price">{b ? 'Não liberado' : brl(p.priceCents)}</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="totem-empty">Nada disponível aqui agora.</p>}
          </div>
          {canSpend === 0 && (
            <div className="totem-error">
              {student.balanceCents <= 0
                ? 'Seu saldo acabou. Peça aos seus pais para recarregar pelo app.'
                : 'Você já usou todo o limite de hoje combinado com seus pais.'}
            </div>
          )}
          {error && <div className="totem-error">{error}</div>}
          <div className="totem-bar">
            <div>
              <span>{count ? `${count} ${count === 1 ? 'item' : 'itens'}` : 'Toque nos lanches'}</span>
              <strong>{brl(total)}</strong>
            </div>
            <button className="totem-cta" disabled={!count} onClick={() => setStep({ name: 'review' })}>
              Ver pedido
            </button>
          </div>
        </div>
      )}

      {step.name === 'review' && student && (
        <div className="totem-review">
          <h1>Seu pedido</h1>
          <ul>
            {lines.map(({ p, q }) => (
              <li key={p.id}>
                <span className="r-name">{p.name}</span>
                <div className="r-qty">
                  <button aria-label={`Menos ${p.name}`} onClick={() => setQty(p.id, q - 1)}>
                    −
                  </button>
                  <span>{q}</span>
                  <button aria-label={`Mais ${p.name}`} onClick={() => (add(p), undefined)}>
                    +
                  </button>
                </div>
                <span className="r-sub">{brl(p.priceCents * q)}</span>
              </li>
            ))}
          </ul>
          <div className="r-total">
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>
          <p className="r-after">Saldo depois do pedido: {brl(student.balanceCents - total)}</p>
          {error && <div className="totem-error">{error}</div>}
          <div className="r-actions">
            <button className="totem-secondary" onClick={() => setStep({ name: 'menu' })}>
              Voltar
            </button>
            <button className="totem-cta" onClick={confirm} disabled={busy}>
              {busy ? 'Enviando…' : 'Confirmar e pagar'}
            </button>
          </div>
        </div>
      )}

      {step.name === 'done' && (
        <div className="totem-done">
          <p>Pedido confirmado!</p>
          <span className="order-label">Sua senha</span>
          <div className="order-number">{pad(step.orderNumber)}</div>
          <p className="done-hint">Aguarde chamarem esse número no balcão.</p>
          <p className="done-balance">
            Pago {brl(step.totalCents)} · saldo restante {brl(step.balanceCents)}
          </p>
          <button className="totem-cta" onClick={() => reset()}>
            Concluir
          </button>
        </div>
      )}
    </div>
  );
}

function TotemHeader({
  student,
  canSpend,
  onCancel,
}: {
  student: CheckoutStudent | null;
  canSpend: number;
  onCancel: () => void;
}) {
  const { user, signOut } = useAuth();
  const taps = useRef<number[]>([]);
  const [exit, setExit] = useState(false);

  // Saída escondida para a equipe: 5 toques rápidos no logo
  function tapLogo() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setExit(true);
    }
  }

  return (
    <header className="totem-header">
      <button className="totem-logo" onClick={tapLogo} aria-label="KioskPay">
        <span className="brand-mark">K</span> Cantina
      </button>
      {student && (
        <div className="totem-who">
          <span>
            Olá, <strong>{student.name.split(/\s+/)[0]}</strong>
          </span>
          <span>Ainda pode gastar: {brl(canSpend)}</span>
        </div>
      )}
      {student && (
        <button className="totem-cancel" onClick={onCancel}>
          Cancelar
        </button>
      )}
      {exit && <ExitDialog email={user?.email ?? ''} onClose={() => setExit(false)} onExit={signOut} />}
    </header>
  );
}

function ExitDialog({ email, onClose, onExit }: { email: string; onClose: () => void; onExit: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.login(email, password); // só confere a senha
      onExit();
    } catch {
      setError('Senha incorreta.');
    }
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // navegador não permite
    }
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Equipe da cantina</h2>
        <button type="button" className="btn btn-secondary" onClick={fullscreen}>
          Entrar/sair da tela cheia
        </button>
        <p className="muted">Para sair do modo totem, digite a senha do usuário {email}.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Senha do totem"
          autoFocus
        />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Voltar ao totem
          </button>
          <button className="btn btn-danger">Sair do totem</button>
        </div>
      </form>
    </div>
  );
}

function Idle({ message, onCard, busy }: { message?: string; onCard: (code: string) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [camera, setCamera] = useState(false);
  const [notice, setNotice] = useState(message);

  useEffect(() => setNotice(message), [message]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(undefined), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // O leitor USB "digita" no campo invisível; mantém o foco nele
  useEffect(() => {
    if (camera) return;
    const focus = () => input.current?.focus({ preventScroll: true });
    focus();
    const t = setInterval(() => {
      if (!document.querySelector('.modal') && document.activeElement !== input.current) focus();
    }, 1000);
    return () => clearInterval(t);
  }, [camera]);

  const onCamera = useCallback(
    (code: string) => {
      setCamera(false);
      onCard(code);
    },
    [onCard],
  );

  return (
    <div className="totem-idle">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = text.trim();
          setText('');
          if (code) onCard(code);
        }}>
        <input
          ref={input}
          className="scanner-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="none"
          autoComplete="off"
          aria-label="Leitor de carteirinha"
        />
      </form>
      <h1>Peça seu lanche aqui</h1>
      <ol className="totem-steps">
        <li>
          <span>1</span>Passe sua carteirinha no leitor
        </li>
        <li>
          <span>2</span>Digite sua senha
        </li>
        <li>
          <span>3</span>Escolha e retire no balcão
        </li>
      </ol>
      <div className="card-target" aria-hidden>
        ▮▮ ▮ ▮▮▮
      </div>
      <button className="totem-cta" onClick={() => setCamera(true)} disabled={busy}>
        {busy ? 'Lendo…' : 'Usar a câmera'}
      </button>
      {notice && <div className="totem-error big">{notice}</div>}
      {camera && <CameraScanner onCode={onCamera} onClose={() => setCamera(false)} />}
    </div>
  );
}

function PinPad({
  firstName,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  firstName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  function press(d: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  // Teclado físico também funciona (útil em computador com tela de toque)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="totem-pin">
      <h1>Olá, {firstName}!</h1>
      <p>Digite sua senha de 4 números</p>
      <div className={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${pin.length} de 4 números`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      {error && <div className="totem-error">{error}</div>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key-muted" onClick={onCancel}>
          Sair
        </button>
        <button onClick={() => press('0')}>0</button>
        <button className="key-muted" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Apagar">
          ⌫
        </button>
      </div>
      <p className="pin-hint">Esqueceu a senha? Seus pais podem criar outra no app.</p>
    </div>
  );
}

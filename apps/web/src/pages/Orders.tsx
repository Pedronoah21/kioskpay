import { useEffect, useRef, useState } from 'react';
import { api, type QueueOrder } from '../api';
import { brl } from '../format';
import { beep } from '../scanner';
import { Alert, PageHeader } from '../ui';

const REFRESH_MS = 5000;

function minutesAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'agora' : `há ${m} min`;
}

const pad = (n: number) => String(n).padStart(3, '0');

/** Fila de pedidos feitos no totem. Atualiza sozinha e bipa quando chega pedido novo. */
export default function Orders() {
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  async function load() {
    try {
      const list = await api.orders();
      const ids = new Set(list.map((o) => o.id));
      if (known.current && list.some((o) => !known.current!.has(o.id)) && soundRef.current) beep(true);
      known.current = ids;
      setOrders(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  async function move(o: QueueOrder, status: 'READY' | 'DELIVERED') {
    setBusy(o.id);
    try {
      await api.setOrderStatus(o.id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pending = orders?.filter((o) => o.orderStatus === 'PENDING') ?? [];
  const ready = orders?.filter((o) => o.orderStatus === 'READY') ?? [];

  return (
    <>
      <PageHeader
        title="Pedidos do totem"
        subtitle="Atualiza sozinho a cada 5 segundos. Já estão pagos: é só preparar e entregar."
        actions={
          <label className="toggle">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Bipe em pedido novo
          </label>
        }
      />
      <Alert>{error}</Alert>
      <div className="queue">
        <section>
          <h2>
            A preparar <span className="count">{pending.length}</span>
          </h2>
          {pending.length === 0 && <p className="muted">Nenhum pedido esperando.</p>}
          {pending.map((o) => (
            <article key={o.id} className="order-card">
              <header>
                <span className="order-no">{pad(o.orderNumber)}</span>
                <span className="muted">{minutesAgo(o.createdAt)}</span>
              </header>
              <p className="order-who">
                {o.student}
                {o.classroom ? <span className="muted"> · {o.classroom}</span> : null}
              </p>
              <ul>
                {o.items.map((i) => (
                  <li key={i.name}>
                    <strong>{i.quantity}×</strong> {i.name}
                  </li>
                ))}
              </ul>
              <footer>
                <span className="muted">{brl(o.totalCents)} pago</span>
                <button className="btn btn-primary" disabled={busy === o.id} onClick={() => move(o, 'READY')}>
                  Pronto
                </button>
              </footer>
            </article>
          ))}
        </section>
        <section>
          <h2>
            Prontos para retirar <span className="count">{ready.length}</span>
          </h2>
          {ready.length === 0 && <p className="muted">Nenhum pedido aguardando retirada.</p>}
          {ready.map((o) => (
            <article key={o.id} className="order-card ready">
              <header>
                <span className="order-no">{pad(o.orderNumber)}</span>
                <span className="muted">pronto {o.readyAt ? minutesAgo(o.readyAt) : ''}</span>
              </header>
              <p className="order-who">{o.student}</p>
              <ul>
                {o.items.map((i) => (
                  <li key={i.name}>
                    <strong>{i.quantity}×</strong> {i.name}
                  </li>
                ))}
              </ul>
              <footer>
                <span />
                <button className="btn btn-secondary" disabled={busy === o.id} onClick={() => move(o, 'DELIVERED')}>
                  Entregue
                </button>
              </footer>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

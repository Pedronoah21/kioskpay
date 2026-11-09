import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { brl } from '../format';
import { Alert, Empty, PageHeader, Spinner, useLoad } from '../ui';

/** Data de hoje em Manaus no formato AAAA-MM-DD */
function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' });
}

export default function Sales() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [date, setDate] = useState(today());
  const day = useLoad(() => api.salesOfDay(date), [date]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refund(id: string, label: string) {
    const reason = window.prompt(`Estornar a venda de ${label}? O valor volta para o saldo do aluno e os itens voltam ao estoque.\n\nMotivo:`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('Informe o motivo do estorno (mínimo 3 letras).');
      return;
    }
    try {
      await api.refundSale(id, reason.trim());
      setNotice(`Venda de ${label} estornada.`);
      setError(null);
      day.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const avg = day.data && day.data.count ? Math.round(day.data.totalCents / day.data.count) : 0;

  return (
    <>
      <PageHeader
        title="Vendas do dia"
        actions={
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Dia"
          />
        }
      />
      <Alert kind="success">{notice}</Alert>
      <Alert>{error ?? day.error}</Alert>

      {day.data && (
        <div className="stats">
          <div>
            <strong>{brl(day.data.totalCents)}</strong>
            <span>vendido</span>
          </div>
          <div>
            <strong>{day.data.count}</strong>
            <span>vendas</span>
          </div>
          <div>
            <strong>{brl(avg)}</strong>
            <span>ticket médio</span>
          </div>
        </div>
      )}

      {day.loading && !day.data ? (
        <Spinner />
      ) : day.data?.sales.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Aluno</th>
                <th>Itens</th>
                <th className="hide-sm">Caixa</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {day.data.sales.map((s) => (
                <tr key={s.id} className={s.status === 'REFUNDED' ? 'refunded' : ''}>
                  <td>
                    {time(s.createdAt)}
                    {s.orderNumber !== null && <span className="tag order-tag">Totem #{String(s.orderNumber).padStart(3, '0')}</span>}
                  </td>
                  <td>
                    <Link to={`/alunos/${s.student.id}`}>{s.student.name}</Link>
                  </td>
                  <td className="items-cell">
                    {s.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </td>
                  <td className="hide-sm muted">{s.operator}</td>
                  <td className="num">{brl(s.totalCents)}</td>
                  <td className="num">
                    {s.status === 'REFUNDED' ? (
                      <span className="tag">Estornada</span>
                    ) : (
                      admin && (
                        <button className="btn btn-ghost danger" onClick={() => refund(s.id, s.student.name)}>
                          Estornar
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nenhuma venda neste dia.</Empty>
      )}
      {!admin && <p className="muted">Precisa estornar uma venda? Peça a um administrador.</p>}
    </>
  );
}
